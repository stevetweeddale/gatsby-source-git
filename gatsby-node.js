const Git = require("simple-git");
const fastGlob = require("fast-glob");
const fs = require(`fs-extra`)
const { createFileNode } = require("gatsby-source-filesystem/create-file-node");
const GitUrlParse = require("git-url-parse");

function getCachedRepoPath(name, programDir) {
  return require("path").join(
    programDir,
    `.cache`,
    `gatsby-source-git`,
    name
  );
}

async function isAlreadyCloned(remote, path) {
  const existingRemote = await Git(path).listRemote(["--get-url"]);
  return existingRemote.trim() == remote.trim();
}

async function getTargetBranch(repo, branch) {
  if (typeof branch == `string`) {
    return `origin/${branch}`;
  } else {
    return repo.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).then(result => result.trim());
  }
}

async function getRepo(path, remote, branch, fetchDepth) {
  // If the directory doesn't exist or is empty, clone. This will be the case if
  // our config has changed because Gatsby trashes the cache dir automatically
  // in that case. Note, however, that if just the branch name changes, then the directory
  // will still exist and we fall into the `isAlreadyCloned` block below.
  let opts = [];

  const depth = fetchDepth ?? 1
  if(depth > 0) {
    opts.push(`--depth`, depth);
  }

  if (!fs.existsSync(path) || fs.readdirSync(path).length === 0) {
    if (typeof branch == `string`) {
      opts.push(`--branch`, branch);
    }
    await Git().clone(remote, path, opts);
    return Git(path);
  } else if (await isAlreadyCloned(remote, path)) {
    const repo = await Git(path);
    const target = await getTargetBranch(repo, branch);
    if (typeof branch == `string`) {
      // First add the remote and fetch. This is a no-op if the branch hasn't changed but
      // it's necessary when the configured branch has changed. This is because, due to
      // the clone options used in the block above, only one remote branch is added, i.e.,
      // the git config fetch refspec looks like this after cloning with a provided branch:
      //
      /// [remote "origin"]
      //   url = git@github.com:<org>/<repo>.git
      //   fetch = +refs/heads/<branch>:refs/remotes/origin/<branch>
      await repo
        .remote(['set-branches', 'origin', branch])
        .then(() => repo.fetch('origin', branch))
        .then(() => repo.checkout(branch))
    }

    await repo
      .fetch(opts)
      .then(() => repo.reset([`--hard`, target]));
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
  { name, remote, branch, patterns = `**`, local, fetchDepth}
) => {
  const programDir = store.getState().program.directory;
  const localPath = local || getCachedRepoPath(name, programDir);
  const parsedRemote = GitUrlParse(remote);

  let repo;
  try {
    repo = await getRepo(localPath, remote, branch, fetchDepth);
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

  // Create a single graph node for this git remote.
  // Filenodes sourced from it will get a field pointing back to it.
  await createNode(
    Object.assign(parsedRemote, {
      id: remoteId,
      sourceInstanceName: name,
      patterns,
      parent: null,
      children: [],
      internal: {
        type: `GitRemote`,
        content: JSON.stringify(parsedRemote),
        contentDigest: createContentDigest(parsedRemote)
      }
    })
  );

  const createAndProcessNode = path => {
    return createFileNode(path, createNodeId, {
      name: name,
      path: localPath
    }).then(fileNode => {
      const relativePath = fileNode.relativePath;
      return repo.log({
        file: relativePath
      })
      .then(log => {
        const latest = log.latest;
        const {date, message, author_name} = latest;
        fileNode.modifiedTime = new Date(Date.parse(date)).toISOString();
        fileNode.message = message;
        fileNode.authorName = author_name;
        return fileNode;
      });
    })
    .then(fileNode => {
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

exports.onPreInit = async ({ reporter, emitter, store }, pluginOptions) => {
  emitter.on('DELETE_CACHE', async () => {
    // The gatsby cache delete algorithm doesn't delete the hidden files, like
    // our .git directories, causing problems for our plugin;
    // So we delete our cache ourself.
    const programDir = store.getState().program.directory;
    const localPath = getCachedRepoPath(pluginOptions.name, programDir);
    try {
      // Attempt to empty dir if remove fails,
      // like when directory is mount point.
      await fs.remove(localPath).catch(() => fs.emptyDir(localPath))
      reporter.verbose(`Removed gatsby-source-git cache directory: ${localPath}`);
    } catch (e) {
      reporter.error(`Failed to remove gatsby-source-git files.`, e);
    }
  });
}

exports.onCreateNode;
