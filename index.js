// noop
const fs = require(`fs-extra`)

function loadNodeContent(fileNode) {
  return fs.readFile(fileNode.absolutePath, `utf-8`)
}

exports.loadNodeContent = loadNodeContent
