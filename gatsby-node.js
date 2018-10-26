const Git = require("simple-git/promise");
const fastGlob = require("fast-glob");
const fs = require("fs");
const { createFileNode } = require("gatsby-source-filesystem/create-file-node");

async function isAlreadyCloned(remote, path) {
  const existingRemote = await Git(path).listRemote(['--get-url']);
  return existingRemote.trim() == remote.trim();
}

async function getTargetBranch(repo, branch) {
  if (typeof branch == `string`) {
    return `origin/${branch}`;
  }
  else {
    return repo.raw(["symbolic-ref", '--short', 'refs/remotes/origin/HEAD']);
  }
}

async function getRepo(path, remote, branch) {
  // If the directory doesn't exist or is empty, clone.
  if (!fs.existsSync(path) || fs.readdirSync(path).length === 0) {
    await Git().clone(remote, path);
    const repo = Git(path);
    const target = await getTargetBranch(repo, branch);
    return repo.checkout(target);
  }
  else if (await isAlreadyCloned(remote, path)) {
    const repo = await Git(path);
    const target = await getTargetBranch(repo, branch);
    return repo.fetch().then(() => repo.checkout(target));
  }
  else {
    throw new Error(`Can't clone to target destination: ${localPath}`);
  }
}


exports.sourceNodes = ({ actions: {createNode}, store, createNodeId, reporter }, { name, remote, branch, patterns = `**` }) => {
  const programDir = store.getState().program.directory;
  const localPath = require('path').join(programDir, `.cache`, `gatsby-source-git`, name);

  const createAndProcessNode = path => {
    const fileNodePromise = createFileNode(path, createNodeId, { name: name, path: localPath }).then(fileNode => {
      // We cant reuse the "File" type, so give the nodes our own type.
      fileNode.internal.type = `Git${fileNode.internal.type}`;
      createNode(fileNode);
      return null;
    });
    return fileNodePromise;
  };

  return getRepo(localPath, remote, branch)
    .then(() => {
      return fastGlob(patterns, { cwd: localPath, absolute: true });
    })
    .then((files) => {
      return Promise.all(files.map(createAndProcessNode));
    })
    .catch(err => reporter.error(err));
};

exports.setFieldsOnGraphQLNodeType = require(`./extend-node-type`);
