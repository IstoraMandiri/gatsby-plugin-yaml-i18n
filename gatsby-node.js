const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const jsYaml = require('js-yaml')

const sourceInstanceName = 'yaml-i18n'

const prefix = (str) => `yamlI18n${str}`
const defaultTemplateName = '_default.js'

const PAGE = prefix('Page')
const NAME = prefix('Name')
const PATH = prefix('Path')
const LOCALE = prefix('Locale')
const FORMAT = prefix('Format') // md / yaml / collection
const EMBED = prefix('Embed')
const GLOBAL = prefix('Global') // global
const MD = prefix('Markdown')
const COLLECTION = prefix('Collection')
const YAML = prefix('Yaml')

const defaultConfig = {
  locales: undefined,
  defaultLocale: undefined,
  generateMissing: false,
  templatesDir: 'src/templates'
}

let config

async function getTemplate (templatePath) {
  const checkedPath = `./${defaultConfig.templatesDir}/${templatePath}`
  const resolved = path.resolve(checkedPath)
  return fs.existsSync(resolved) ? checkedPath : false
}

// check template location up the tree until you find existing template
async function resolveTemplate (relativePath) {
  const fragments = relativePath === '' ? ['index'] : relativePath.split('/')
  const exactMatch = await getTemplate(`${fragments.join('/')}.js`)
  if (exactMatch) {
    return exactMatch
  }
  for (let i = 1; i < fragments.length + 1; i++) {
    const query = [...fragments, null].slice(0, -i).join('/')
    const match = await getTemplate(`${query}/${defaultTemplateName}`)
    if (match) {
      return match
    }
  }
  return getTemplate(defaultTemplateName)
}

function createNodeFields ({ node, actions: { createNodeField } }, fields) {
  Object.keys(fields).forEach(k => {
    createNodeField({ node, name: k, value: fields[k] })
  })
}

async function createYamlChildren (opts, fields) {
  const { node, loadNodeContent, actions: { createNode, createParentChildLink } } = opts

  function createChild (content, index) {
    const body = JSON.stringify(content)
    const postfix = index === undefined ? '' : `-${index}`
    const nodeData = {
      body,
      index,
      id: prefix(`-${node.relativePath}${postfix}`),
      locale: fields[LOCALE],
      parent: node.id,
      path: fields[PATH],
      internal: {
        type: fields[FORMAT],
        contentDigest: crypto.createHash('md5').update(body).digest('hex')
      }
    }
    if (fields[FORMAT] === COLLECTION) {
      nodeData.content = content
      nodeData.name = fields[NAME]
    }
    createNode(nodeData)
    createParentChildLink({ parent: node, child: nodeData })
  };

  const parsed = jsYaml.load(await loadNodeContent(node))

  if (fields[FORMAT] === COLLECTION) {
    parsed.forEach(createChild)
  } else {
    createChild(parsed)
  }
}

exports.sourceNodes = (_, opts) => {
  if (!Array.isArray(opts.locales)) {
    throw new Error('You must specify a `locales` array in plugin options')
  }
  config = {
    ...defaultConfig,
    ...opts
  }
  config.defaultLocale = config.defaultLocale || opts.locales[0]
}

// here we just locate and tag relevant nodes
exports.onCreateNode = async (opts) => {
  const { node } = opts
  if (node.sourceInstanceName === sourceInstanceName) {
    // handle pages
    if (node.internal.type === 'Directory') {
      createNodeFields(opts, { [PAGE]: true })
      return
    }
    // parse the filename, `name.[type?].locale.ext`
    const [name, type, locale] = node.name.split('.')
    // default fields for querying
    const fields = {
      [NAME]: name.replace(/-([a-z])/g, (g) => g[1].toUpperCase()), // da-shes to camelCase
      [PATH]: node.relativeDirectory,
      [LOCALE]: locale,
      [EMBED]: false,
      [GLOBAL]: false,
      [FORMAT]: undefined
    }
    // decorate correct params
    if (locale === undefined) {
      fields[LOCALE] = type
    }
    if (type === 'global') {
      fields[GLOBAL] = true
    }
    if (node.extension === 'md' || node.extension === 'mdx') {
      fields[FORMAT] = MD
      fields[EMBED] = true
    }
    if (type !== 'collection' && node.extension === 'yaml') {
      fields[FORMAT] = YAML
      fields[EMBED] = true
      await createYamlChildren(opts, fields)
    }
    if (type === 'collection' && node.extension === 'yaml') {
      fields[FORMAT] = COLLECTION
      await createYamlChildren(opts, fields)
    }
    // update the parent node fields for querying
    if (fields[FORMAT]) {
      createNodeFields(opts, fields)
    }
  }
}

exports.createPages = async ({ graphql, getNode, actions: { createPage } }) => {
  const result = await graphql(`
    query {
      pages: allDirectory(filter: {fields: {${PAGE}: {eq: true}}}) {
        edges {
          node {
            relativePath
          }
        }
      }
      translations: allFile(filter: {fields: {${EMBED}: {eq: true}}}) {
        edges {
          node {
            id
            children {
              ... on Mdx {
                mdx: body
                id
              }
              ... on ${YAML} {
                yaml: body
              }
            }
            fields {
              ${GLOBAL}
              ${LOCALE}
              ${NAME}
              ${PATH}
            }
          }
        }
      }
    }
  `)
  const { data: { translations: { edges: translations }, pages: { edges: pages } } } = result

  const globalTree = {}
  const localTree = {}

  translations.forEach(({ node: { fields, children } }) => {
    const { [GLOBAL]: global, [NAME]: name, [PATH]: path, [LOCALE]: locale } = fields
    const tree = global ? globalTree : localTree
    const branch = tree[path] || {}
    let data = {}
    if (children[0].mdx) {
      const { mdx, id } = children[0]
      const params = getNode(id).frontmatter
      const parsed = { ...params, mdx }
      data = name === 'index' ? parsed : { [name]: parsed }
    }
    if (children[0].yaml) {
      const parsed = JSON.parse(children[0].yaml)
      data = (name === 'index' && !Array.isArray(parsed)) ? parsed : { [name]: parsed }
    }
    tree[path] = {
      ...branch,
      [locale]: {
        ...branch[locale],
        ...data
      }
    }
  })

  function merge (o, n) {
    if (o === undefined) {
      return n
    }
    if (n === undefined) {
      return o
    }
    if (['string', 'boolean', 'number', 'bigint'].indexOf(typeof n) >= 0) {
      return n
    }
    if (n instanceof Date) {
      return n
    }
    // use `key` in arrays to match
    if (Array.isArray(n)) {
      if (!Array.isArray(o)) {
        return n
      }
      return o.map(item => {
        const match = n.find(({ key }) => key === item.key)
        return merge(item, match)
      })
    }
    // if it's an object...
    const res = {}
    Object.keys(o).forEach(key => {
      if (n[key] !== undefined) {
        res._localized = true
      }
      res[key] = merge(o[key], n[key])
    })
    return res
  }

  function getGlobals (relativePath, locale) {
    return Object.keys(globalTree).reduce((o, key) =>
      relativePath.startsWith(key) ? { ...o, ...globalTree[key][locale] } : o
    , {})
  }

  function shouldGenerate ({ locals, isDefault, relativePath, generateMissing }) {
    if (generateMissing === true || isDefault || locals._localized) {
      return true
    }
    if (Array.isArray(generateMissing)) {
      if (generateMissing.indexOf('.yaml') >= 0 && !locals.mdx) {
        return true
      }
      if (generateMissing.indexOf('.md') >= 0 && locals.mdx) {
        return true
      }
      if (generateMissing.find(p => relativePath.startsWith(p))) {
        return true
      }
    }
    return false
  }

  pages.forEach(async ({ node: { relativePath } }) => {
    // TODo somehow invalidate the template when rebuilding page...
    const comPath = await resolveTemplate(relativePath)
    const component = path.resolve(comPath)
    const { defaultLocale, locales, generateMissing } = config
    const defaultGlobals = getGlobals(relativePath, defaultLocale)
    const defaultLocals = (localTree[relativePath] || {})[defaultLocale] || {}
    locales.forEach((locale) => {
      const isDefault = (locale === defaultLocale)
      const globals = isDefault ? defaultGlobals : merge(defaultGlobals, getGlobals(relativePath, locale))
      const locals = isDefault ? defaultLocals : merge(defaultLocals, (localTree[relativePath] || {})[locale])
      const linkPrefix = isDefault ? '' : `${locale}/`
      const thisPath = `/${linkPrefix}${relativePath}`
      // skip markdown page creation if it wasn't translated, unless overridden
      if (shouldGenerate({ locals, isDefault, relativePath, generateMissing })) {
        createPage({
          path: thisPath,
          component,
          context: {
            locale,
            linkPrefix,
            locales,
            defaultLocale,
            relativePath,
            i18n: {
              ...locals,
              globals
            }
          }
        })
      }
    })
  })
}
