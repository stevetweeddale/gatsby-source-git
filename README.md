# gatsby-source-git

Source plugin for pulling files into the Gatsby graph from abitrary Git repositories (hosted anywhere). This is useful if the markdown files you wish to render can't live within your gatsby codebase, or if need to aggregate content from disparate repositories.


It clones the repo(s) you configure (a shallow clone, into your cache folder if you're interested), and then sucks in the files within in a very similar manner to `gatsby-source-filesystem`. As such, the nodes it creates should get picked up by all the tranformer plugins you'd hope, like `gatsby-transformer-remark`, `gatsby-transformer-json` etc.

## Requirements

Requires [git](http://git-scm.com/downloads) to be installed, and to be callable using the command `git`.

Ideally we'd use [nodegit](https://github.com/nodegit/nodegit), but it doesn't support shallow clones (see [libgit2/libgit2#3058](https://github.com/libgit2/libgit2/issues/3058)) which would have a significant effect on build times if you wanted to read files from git repositories with large histories.

Only public repositories are supported right now. But a PR should be simple enough if you want that.

## Install

Not published on npm yet, so for now:

`npm install --save stevetweeddale/gatsby-source-git`

## How to use

```javascript
// In your gatsby-config.js
module.exports = {
  plugins: [
    // You can have multiple instances of this plugin
    // to read source nodes from different repositories.
    {
      resolve: `gatsby-source-git`,
      options: {
        name: `repo-one`,
        remote: `https://bitbucket.org/stevetweeddale/markdown-test.git`,
        // Optionally supply a branch/tag. If none supplied, you'll get the default.
        branch: `develop`,
        // Tailor which files get imported.
        patterns: `docs/**`,
      }
    },
    {
      resolve: `gatsby-source-git`,
      options: {
        name: `repo-two`,
        remote: `https://bitbucket.org/stevetweeddale/markdown-test.git`,
        // Multiple patterns and negation supported. See https://github.com/mrmlnc/fast-glob
        patterns: [`*`, `!*.md`],
      }
    },
  ],
}
```

## How to query

You can query file nodes like the following:

```graphql
{
  allGitFile {
    edges {
      node {
        extension
        dir
        modifiedTime
      }
    }
  }
}
```

To filter by the `name` you specified in the config, use `sourceInstanceName`:

```graphql
{
  allGitFile(filter: { sourceInstanceName: { eq: "repo-one" } }) {
    edges {
      node {
        extension
        dir
        modifiedTime
      }
    }
  }
}
```
