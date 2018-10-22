const Git = require("simple-git/promise");
const fastGlob = require("fast-glob");
const fs = require("fs");
const rmrf = require("rimraf");
const { createFileNode } = require("gatsby-source-filesystem/create-file-node");

async function isAlreadyCloned(remote, path) {
  const existingRemote = await Git(path).raw(['config', '--get', 'remote.origin.url']);
  return existingRemote.trim() == remote.trim();
}

async function getRepo(path, remote, branch) {
  // If the directory doesn't exist, is empty, or is a matching clone: re-clone.
  if (!fs.existsSync(path) || fs.readdirSync(path).length === 0 || await isAlreadyCloned(remote, path)) {
    rmrf.sync(path);
    let opts = [`--depth`, `1`];
    if (typeof branch == `string`) {
      opts.push(`--branch`, branch);
    }
    return Git().clone(remote, path, opts)
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
