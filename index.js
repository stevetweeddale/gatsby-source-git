"use strict";

const fs = require(`fs-extra`);

function loadNodeContent(GitFileNode) {
  return fs.readFile(GitFileNode.absolutePath, `utf-8`);
}

exports.createFilePath = require(`./create-file-path`);
exports.loadNodeContent = loadNodeContent;
