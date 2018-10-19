"use strict";

const fs = require(`fs-extra`);

function loadNodeContent(GitFileNode) {
  return fs.readFile(GitFileNode.absolutePath, `utf-8`);
}

exports.loadNodeContent = loadNodeContent;
