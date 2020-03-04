# gatsby-source-git

Source plugin for pulling files into the Gatsby graph from abitrary Git repositories (hosted anywhere). This is useful if the markdown files you wish to render can't live within your gatsby codebase, or if need to aggregate content from disparate repositories.

It clones the repo(s) you configure (a shallow clone, into your cache folder if
you're interested), and then sucks the files into the graph as `File` nodes, as
if you'd configured
[`gatsby-source-filesystem`](https://www.gatsbyjs.org/packages/gatsby-source-filesystem/)
on that directory. As such, all the tranformer plugins that operate on files
should work exactly as they do with `gatsby-source-filesystem` eg with
`gatsby-transformer-remark`, `gatsby-transformer-json` etc.

The only difference is that the `File` nodes created by this plugin will
also have a `gitRemote` field, which will provide you with various bits of
Git related information. The fields on the `gitRemote` node are
mostly provided by
[IonicaBazau/git-url-parse](https://github.com/IonicaBizau/git-url-parse), with
the addition of `ref` and `weblink` fields, which are
the 2 main things you probably want if you're constructing "edit on github"
style links.

## Requirements

Requires [git](http://git-scm.com/downloads) to be installed, and to be callable using the command `git`.

Ideally we'd use [nodegit](https://github.com/nodegit/nodegit), but it doesn't support shallow clones (see [libgit2/libgit2#3058](https://github.com/libgit2/libgit2/issues/3058)) which would have a significant effect on build times if you wanted to read files from git repositories with large histories.

Only public repositories are supported right now. But a PR should be simple enough if you want that.

## Install

`npm install --save gatsby-source-git`

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
        // Optionally supply a branch. If none supplied, you'll get the default branch.
        branch: `develop`,
        // Tailor which files get imported eg. import the docs folder from a codebase.
        patterns: `docs/**`,

        // (Optional) Collect the contributor list for the repo and/or for each
        // file that is checked out. This will be available to Gatsby queries
        // as part of the File node (see below). Note: for larger repository
        // histories this operation may take a bit. Also, the default checkout
        // depth is 1, so unless you change it, you'll only ever see the last
        // contributor when using the 'path' option.

        // Options are:
        //    undefined/false - Do not collect contributor records (Default)
        //    'repo'          - Collect contributors only for the repo itself
        //    'path'          - Collect contributors for each file
        //    'all'           - Perform both 'repo' and 'path' collection
        // contributors: false,
      }
    },
    {
      resolve: `gatsby-source-git`,
      options: {
        name: `repo-two`,
        remote: `https://bitbucket.org/stevetweeddale/markdown-test.git`,
        // Multiple patterns and negation supported. See https://github.com/mrmlnc/fast-glob
        patterns: [`*`, `!*.md`]
      }
    }
  ]
};
```

## How to query

You can query file nodes exactly as you would node query for nodes created with
[`gatsby-source-filesystem`](https://www.gatsbyjs.org/packages/gatsby-source-filesystem/),
eg:

```graphql
{
  allFile {
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

Similarly, you can filter by the `name` you specified in the config by using
`sourceInstanceName`:

```graphql
{
  allFile(filter: { sourceInstanceName: { eq: "repo-one" } }) {
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

And access some information about the git repo:

```graphql
{
  allFile {
    edges {
      node {
        gitRemote {
          webLink
          ref
        }
      }
    }
  }
}
```

### Querying for Contributors

Contributions are obtained directly from the git log, summarized, and made available to the GraphQL language as part of the File node created (or for the repo itself). The available fields are (again, according to the git log):

* `count` - The number of commits/contributions for this person
* `name` - The name of this contributor (e.g. "Jane Developer")
* `email` - The email address for the contributor (e.g. jane@company.com)

> Note: By default this plugin only performs a shallow checkout (e.g. `--depth 1`) so you will only get the latest contributor for each file if using the `contributors: path` plugin option above.

```graphql
{
  allFile {
    edges {
      node {
        gitContributors {
          count
          name
          email
        }
        gitRemote {
          webLink
          ref
          gitContributors {
            count
            name
            email
          }
        }
      }
    }
  }
}
```

Further, the underlying git command is capable of doing some amount of person-matching in order to clean up the contributors list and merge authors in a noisy history via a `.mailmap` file. Please see the [documentation for git shortlog](https://git-scm.com/docs/git-shortlog) for futher details.
