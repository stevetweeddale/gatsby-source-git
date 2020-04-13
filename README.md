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

N.B. Although with respect to sourcing this works as a drop-in replacement for `gatsby-source-filesystem`, there are a number of helpers included in that module (`createFilePath`, `createRemoteFileNode`, `createFileNodeFromBuffer`) that are not duplicated here – but you can still import and use them from there as needed.

## Requirements

Requires [git](http://git-scm.com/downloads) to be installed, and to be callable using the command `git`.

Ideally we'd use [nodegit](https://github.com/nodegit/nodegit), but it doesn't support shallow clones (see [libgit2/libgit2#3058](https://github.com/libgit2/libgit2/issues/3058)) which would have a significant effect on build times if you wanted to read files from git repositories with large histories.

## Install

`npm install --save gatsby-source-git`

## Configuration

### Plugin options

- `name`: A machine name label for each plugin instance.
- `remote`: The url to clone from.
- `branch` (optional): The branch to use. If none supplied, we try to use the
  'default' branch.
- `patterns` (optional): Passed to
  [fast-glob](https://github.com/mrmlnc/fast-glob) to determine which files get
  sucked into the graph.
- `local` (optional): Specify the local path for the cloned repo. If omitted,
  it will default to a directory within the local Gatsby cache. Note that using
  a location outside the cache will prevent you changing the branch via
  gatsby-config.js. You will need to synchronise the branch of the local
  checkout yourself. On the plus side, it will prevent your local repo
  getting trashed when Gatsby clears the cache, which can speed things up.
- `contributors` (optional): Collect the contributor list for the repo and/or for each
  file that is checked out. This will be available to Gatsby queries
  as part of the File node (see [Querying for Contributors](#Querying-for-Contributors) below). Note: for larger repository
  histories this operation may take a bit. Also, the default checkout
  depth is 1, so unless you change it, you'll only ever see the last
  contributor when using the `"path"` option.

  The valid options for `contributors` are:
  - `undefined` or `false` (Default): Do not collect contributor records
  - `"repo"`: Collect contributors only for the repo itself
  - `"path"`: Collect contributors for each file
  - `"all"`: Perform both `"repo"` and `"path"` collection

- `depth` (optional): Configure the checkout/fetch depth when refreshing from
  upstream repository. To fetch the entire history, use 'all' here.
  The default is to perform a shallow clone (i.e. depth = 1).


### Example gatsby-config.js

```javascript
module.exports = {
  plugins: [
    // You can have multiple instances of this plugin to read source files from
    // different repositories or locations within a repository.
    {
      resolve: `gatsby-source-git`,
      options: {
        name: `repo-one`,
        remote: `https://bitbucket.org/stevetweeddale/markdown-test.git`,
        branch: `develop`,

        // Only import the docs folder from a codebase.
        patterns: `docs/**`,
      }
    },
    {
      resolve: `gatsby-source-git`,
      options: {
        name: `repo-two`,
        remote: `https://bitbucket.org/stevetweeddale/markdown-test.git`,
        // Specify the local checkout location, to avoid it being trashed on
        // cache clears.
        local: '/explicit/path/to/repo-two',
        // Multiple patterns and negation supported. See https://github.com/mrmlnc/fast-glob
        patterns: [`*`, `!*.md`]
      }
    }
  ]
};
```

This will result in `File` nodes being put in your data graph, it's then up to you to do whatever it is you want to do with that data.

### Private repositories

Most git hosting providers support authentication via URL, either in the form of username and password or more commonly access tokens. So to use a private github repository as an example, you would firstly [generate a personal access token](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line). Now you don't want that in your repo, so instead you'd [set an OS environment variable](https://www.gatsbyjs.org/docs/environment-variables/#server-side-nodejs) and then read that environment variable into your plugin config something like:

```javascript
{
  resolve: `gatsby-source-git`,
  options: {
    name: `my-repo`,
    remote: `https://myuser:${process.env.GITHUB_TOKEN}@github.com/my-repo`,
  },
}
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

> Note: By default this plugin only performs a shallow checkout (e.g. `--depth 1`) so you will only get the latest contributor for each file if using the `contributors: path` plugin option above. Use the `depth: all` option (or some other value) to get more than just the latest log entries.

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


## Creating pages

If you want to programatically create pages on your site from the files in your git repo, you should be able to follow the standard examples, such as [part 7 of the Gatsby tutorial](https://www.gatsbyjs.org/tutorial/part-seven/) or [the standard docs page](https://www.gatsbyjs.org/docs/creating-and-modifying-pages/#creating-pages-in-gatsby-nodejs).

