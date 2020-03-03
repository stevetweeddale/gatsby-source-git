const Git = require("simple-git/promise");
const fastGlob = require("fast-glob");
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

async function parseContributors(repo, path) {
  let args = ['shortlog', '-n', '-s', '-e', 'HEAD'];
  if (path) {
    args.push('--', path);
  }
  return repo.raw(args).then(result => result.trim().split('\n').map(x => {
    let items = x.trim().split(/\s*(\d+)\s+(.+?)\s+<([^>]+)>\s*/g).slice(1, -1);
    return {
      count: parseInt(items[0]),
      name: items[1],
      email: items[2]
    };
  }));
}

async function getRepo(path, remote, branch, depth) {
  // If the directory doesn't exist or is empty, clone. This will be the case if
  // our config has changed because Gatsby trashes the cache dir automatically
  // in that case.
  if (!fs.existsSync(path) || fs.readdirSync(path).length === 0) {
    let opts = [];
    if ( depth && depth !== 'all' ) {
      opts.push(`--depth`, depth);
    }
    if (typeof branch == `string`) {
      opts.push(`--branch`, branch);
    }
    await Git().clone(remote, path, opts);
    return Git(path);
  } else if (await isAlreadyCloned(remote, path)) {
    const repo = await Git(path);
    const target = await getTargetBranch(repo, branch);
    // Refresh our shallow clone with the latest commit.
    if( depth && depth !== 'all' ) {
      await repo.fetch([`--depth`, depth]);
    } else {
      await repo.fetch();
    }
    await repo.reset([`--hard`, target]);
    return repo;
  } else {
    throw new Error(`Can't clone to target destination: ${localPath}`);
  }
}

exports.sourceNodes = async (
  {
    actions: { createNode },
    store,
    createNodeId,
    createContentDigest,
    reporter
  },
  { name, remote, branch, patterns = `**`, depth = 1, contributors }
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
    repo = await getRepo(localPath, remote, branch, depth);
  } catch (e) {
    return reporter.error(e);
  }

  parsedRemote.git_suffix = false;
  parsedRemote.webLink = parsedRemote.toString("https");
  delete parsedRemote.git_suffix;
  let ref = await repo.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
  parsedRemote.ref = ref.trim();

  const repoFiles = await fastGlob(patterns, {
    cwd: localPath,
    absolute: true
  });

  const remoteId = createNodeId(`git-remote-${name}`);

  let repoContributors = undefined;
  if (contributors && (contributors == 'all' || contributors === 'repo')) {
    repoContributors = {
      gitContributors: await parseContributors(repo)
    };
  }
  const wantFileContributors = contributors && (contributors == 'all' || contributors == 'path');

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
    }, repoContributors)
  );

  const createAndProcessNode = async path => {
    let fileNode = await createFileNode(path, createNodeId, {
      name: name,
      path: localPath
    });

    // Add contributors if requested.
    if (wantFileContributors) {
      fileNode.gitContributors = await parseContributors(repo, path);
    }

    // Add a link to the git remote node
    fileNode.gitRemote___NODE = remoteId;

    // Then create the node, as if it were created by the gatsby-source
    // filesystem plugin.
    return createNode(fileNode, {
      name: `gatsby-source-filesystem`
    });
  };

  return Promise.all(repoFiles.map(createAndProcessNode));
};

exports.onCreateNode;
