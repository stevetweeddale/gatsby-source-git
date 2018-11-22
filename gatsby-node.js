const Git = require("simple-git/promise");
const fastGlob = require("fast-glob");
const fs = require("fs");
const { createFileNode } = require("gatsby-source-filesystem/create-file-node");
const GitUrlParse = require("git-url-parse");
const cloneDeep = require("lodash.clonedeep");

async function isAlreadyCloned(remote, path) {
  const existingRemote = await Git(path).listRemote(["--get-url"]);
  return existingRemote.trim() == remote.trim();
}

async function getTargetBranch(repo, branch) {
  if (typeof branch == `string`) {
    return `origin/${branch}`;
  } else {
    return repo.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  }
}

async function getRepo(path, remote, branch) {
  // If the directory doesn't exist or is empty, clone. This will be the case if
  // our config has changed because Gatsby trashes the cache dir automatically
  // in that case.
  if (!fs.existsSync(path) || fs.readdirSync(path).length === 0) {
    let opts = [`--depth`, `1`];
    if (typeof branch == `string`) {
      opts.push(`--branch`, branch);
    }
    await Git().clone(remote, path, opts);
    return Git(path);
  } else if (await isAlreadyCloned(remote, path)) {
    const repo = await Git(path);
    const target = await getTargetBranch(repo, branch);
    // Refresh our shallow clone with the latest commit.
    await repo
      .fetch([`--depth`, `1`])
      .then(() => repo.reset([`--hard`, target]));
    return repo;
  } else {
    throw new Error(`Can't clone to target destination: ${localPath}`);
  }
}

exports.sourceNodes = async (
  { actions: { createNode }, store, createNodeId, reporter },
  { name, remote, branch, patterns = `**` }
) => {
  const programDir = store.getState().program.directory;
  const localPath = require("path").join(
    programDir,
    `.cache`,
    `gatsby-source-git`,
    name
  );
  const parsedRemote = GitUrlParse(remote);

  let repo;
  try {
    repo = await getRepo(localPath, remote, branch);
  } catch (e) {
    return reporter.error(e);
  }

  parsedRemote.git_suffix = false;
  parsedRemote.webLink = parsedRemote.toString("https");
  let ref = await repo.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
  parsedRemote.ref = ref.trim();

  const repoFiles = await fastGlob(patterns, {
    cwd: localPath,
    absolute: true
  });

  return Promise.all(
    repoFiles.map(path => {
      const fileNodePromise = createFileNode(path, createNodeId, {
        name: name,
        path: localPath
      }).then(fileNode => {
        // We cant reuse the "File" type, so give the nodes our own type.
        fileNode.internal.type = `Git${fileNode.internal.type}`;
        // Add some helpful context to each node.
        fileNode.remote = cloneDeep(parsedRemote);
        createNode(fileNode);
        return null;
      });
      return fileNodePromise;
    })
  );
};

exports.setFieldsOnGraphQLNodeType = require(`./extend-node-type`);
