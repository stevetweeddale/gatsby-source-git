const Git = require("simple-git/promise");
const fastGlob = require("fast-glob");
const { join } = require("path");
const fs = require("fs");
const { createFileNode } = require("gatsby-source-filesystem/create-file-node");
const GitUrlParse = require("git-url-parse");

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
    throw new Error(`Can't clone to target destination: ${path}`);
  }
}

const toArray = x => (Array.isArray(x) ? x : [x]).filter(a => a);
const patternEntry = ([name, pattern]) => ({ name, pattern });
const parsePatterns = (patterns, name) => {
  if (Array.isArray(patterns)) {
    return patterns.filter(a => typeof a === "string").map(parsePatterns);
  }
  if (typeof patterns === "string") return patternEntry([name, patterns]);
  if (typeof patterns === "object") {
    return Object.entries(patterns).map(patternEntry);
  }
};

const getLocalFiles = (cwd, patterns, defaultName) => {
  const patternGroups = toArray(parsePatterns(patterns, defaultName));
  return Promise.all(
    patternGroups.map(async ({ name, pattern }) => {
      const files = await fastGlob(pattern, { cwd, absolute: true });
      return files.map(path => ({ path, name }));
    })
  );
};

exports.sourceNodes = async (
  {
    actions: { createNode },
    store,
    createNodeId,
    createContentDigest,
    reporter
  },
  { name, remote, branch, patterns = `**` }
) => {
  const programDir = store.getState().program.directory;
  const localPath = join(programDir, `.cache`, `gatsby-source-git`, name);
  const parsedRemote = GitUrlParse(remote);

  let repo;
  try {
    repo = await getRepo(localPath, remote, branch);
  } catch (e) {
    return reporter.error(e);
  }

  parsedRemote.git_suffix = false;
  parsedRemote.webLink = parsedRemote.toString("https");
  delete parsedRemote.git_suffix;
  let ref = await repo.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
  parsedRemote.ref = ref.trim();

  const repoFiles = await getLocalFiles(localPath, patterns, name);

  const remoteId = createNodeId(`git-remote-${name}`);

  // Create a single graph node for this git remote.
  // Filenodes sourced from it will get a field pointing back to it.
  await createNode(
    Object.assign(parsedRemote, {
      id: remoteId,
      sourceInstanceName: name,
      parent: null,
      children: [],
      internal: {
        type: `GitRemote`,
        content: JSON.stringify(parsedRemote),
        contentDigest: createContentDigest(parsedRemote)
      }
    })
  );

  const createAndProcessNode = ({ path, name }) => {
    return createFileNode(path, createNodeId, {
      name: name,
      path: localPath
    }).then(fileNode => {
      // Add a link to the git remote node
      fileNode.gitRemote___NODE = remoteId;
      // Then create the node, as if it were created by the gatsby-source
      // filesystem plugin.
      return createNode(fileNode, {
        name: `gatsby-source-filesystem`
      });
    });
  };

  return Promise.all(repoFiles.map(createAndProcessNode));
};

exports.onCreateNode;
