// @ts-check
const debug = require('debug')('dependency-version-badge')
const path = require('path')
const fs = require('fs')
const os = require('os')
const getPackageFromGitHub = require('get-package-json-from-github')

function escapeName(name) {
  // for shields.io need to change each '-' into '--'
  return name.replace(/-/g, '--')
}

/**
 * Replaces the whole Markdown image badge with new version badge.
 * The badge is formed like "![name version](url...escaped name-version)"
 */
function replaceVersionShield({ markdown, name, newVersion, usedIn, short }) {
  if (!name) {
    throw new Error('Missing the library name')
  }
  if (!newVersion) {
    throw new Error('Missing the new version')
  }

  const escapedName = escapeName(name)
  // if the user only wants the dependency version (without name)
  // then the flag is set "short: true" and the text of the badge
  // will end with "... short". For regular badges we search for
  // badge text that ends with "... version"
  const suffix = short ? 'short' : 'version'
  const label = usedIn
    ? `${name} used in ${usedIn} ${suffix}`
    : `${name} ${suffix}`

  const fullBadgeVersionRe = new RegExp(
    `\\!\\[${label}\\]` +
      '\\(https://img\\.shields\\.io/badge/' +
      escapedName +
      '-(\\d+\\.\\d+\\.\\d+)-brightgreen\\)',
  )

  const shortBadgeVersionRe = new RegExp(
    `\\!\\[${label}\\]` +
      '\\(https://img\\.shields\\.io/badge/' +
      '(\\d+\\.\\d+\\.\\d+)-brightgreen\\)',
  )

  const fullBadge = `![${label}](https://img.shields.io/badge/${escapedName}-${newVersion}-brightgreen)`
  const shortBadge = `![${label}](https://img.shields.io/badge/${newVersion}-brightgreen)`

  const badgeVersionRe = short ? shortBadgeVersionRe : fullBadgeVersionRe
  const badge = short ? shortBadge : fullBadge

  debug('new badge contents "%s"', badge)
  let found

  let updatedReadmeText = markdown.replace(badgeVersionRe, (match) => {
    found = true
    return badge
  })

  if (!found) {
    console.log('⚠️ Could not find version badge for dependency "%s"', name)
    console.log('Insert new badge on the first line')
    debug('inserting new badge: %s', badge)

    const lines = markdown.split(os.EOL)
    if (lines.length < 1) {
      console.error('README file has no lines, cannot insert version badge')
      return markdown
    }
    lines[0] += ' ' + badge
    updatedReadmeText = lines.join(os.EOL)
  }
  return updatedReadmeText
}

function getAnyDependency(pkg, name) {
  const allDependencies = Object.assign(
    {},
    pkg.dependencies,
    pkg.devDependencies,
  )
  return allDependencies[name]
}

function findVersionFromPackageFile(name) {
  debug('reading version of "%s" from package.json file', name)
  const pkgFilename = path.join(process.cwd(), 'package.json')
  const pkg = require(pkgFilename)
  const currentVersion = getAnyDependency(pkg, name)
  return currentVersion
}

/**
 *
 */
function findVersionFromGitHub(name, repoUrl) {
  return getPackageFromGitHub(repoUrl).then((pkg) => {
    return getAnyDependency(pkg, name)
  })
}

function findVersionFrom(name, from) {
  if (from) {
    return findVersionFromGitHub(name, from)
  }
  // assuming local package.json file
  return Promise.resolve(findVersionFromPackageFile(name))
}

function parseGitHubRepo(maybeGitHubUrl) {
  if (!maybeGitHubUrl) {
    return
  }

  const parts = maybeGitHubUrl.split('/')
  return parts[parts.length - 1]
}

/**
 * @param {string} x
 */
function isGitHubRepoUrl(x) {
  return x.startsWith('https://github.com')
}

/**
 * Normalizes the dependency version, removing special characters like "~" or "^"
 * If the version is still fuzzy, like "*" returns null
 * @param {string} version
 */
function cleanVersion(version) {
  if (version.includes('*')) {
    debug('cannot clean version "%s" with *', version)
    return null
  }

  return version.replace(/\~/g, '').replace(/\^/g, '')
}

/**
 * Updates the given badge (if found) with new version information
 * read from the "package.json" file. Returns a promise
 */
function updateBadge({ name, from, short }) {
  debug('updating badge %o', { name, from, short })

  if (from && !isGitHubRepoUrl(from)) {
    from = `https://github.com/${from}`
    debug('set --from to "%s"', from)
  }

  return findVersionFrom(name, from).then((currentVersion) => {
    if (!currentVersion) {
      const message = `Could not find dependency "${name}" among dependencies`
      debug(message)
      return Promise.reject(new Error(message))
    }

    const cleanedVersion = cleanVersion(currentVersion)
    if (!cleanedVersion) {
      const message = `Could not clean version "${currentVersion}" for ${name}`
      debug(message)
      return Promise.reject(new Error(message))
    }
    currentVersion = cleanedVersion

    debug('current dependency version %s@%s', name, currentVersion)

    const readmeFilename = path.join(process.cwd(), 'README.md')
    const readmeText = fs.readFileSync(readmeFilename, 'utf8')
    const usedIn = parseGitHubRepo(from)

    const maybeChangedText = replaceVersionShield({
      markdown: readmeText,
      name,
      newVersion: currentVersion,
      usedIn,
      short,
    })
    if (maybeChangedText !== readmeText) {
      console.log('saving updated readme with %s@%s', name, currentVersion)
      fs.writeFileSync(readmeFilename, maybeChangedText, 'utf8')
    } else {
      debug('no updates for dependency %s', name)
    }
  })
}

module.exports = {
  updateBadge,
  replaceVersionShield,
  parseGitHubRepo,
  cleanVersion,
}
