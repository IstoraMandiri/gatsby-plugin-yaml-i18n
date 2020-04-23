const PLUGIN_NAME = 'yaml-i18n'
const TEMPLATES_KEY = `${PLUGIN_NAME}-templates`
const CONTENT_KEY = `${PLUGIN_NAME}-content`
const YAML = 'i18nYaml'
const MARKDOWN = 'i18nMarkdown'
const COLLECTION = 'i18nCollection'
const DEFAULT_TEMPLATE = '_default.js'
const DEFAULT_MDX_TEMPLATE = '_markdown.js'
const FIELD_NAME = 'i18n'

const defaultConfig = {
  locales: undefined,
  defaultLocale: undefined,
  generateMissing: false
}

function getConfig (passedConfig) {
  if (!Array.isArray(passedConfig.locales)) {
    throw new Error('You must specify a `locales` array in plugin options')
  }
  return {
    ...defaultConfig,
    ...passedConfig,
    defaultLocale: passedConfig.defaultLocale || passedConfig.locales[0]
  }
}

function camelCase (str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
}

function getGlobals (tree, path, locale) {
  return Object.keys(tree).reduce((o, k) => path.startsWith(k) ? { ...o, ...tree[k][locale] } : o, {})
}

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
    return o.map((item) => {
      if (!item.key) { return item }
      const match = n.find(({ key }) => key === item.key)
      return merge(item, match)
    })
  }
  // if it's an object...
  const res = {}
  Object.keys(o).forEach((key) => {
    if (n[key] !== undefined) {
      res._localized = true
    }
    res[key] = merge(o[key], n[key])
  })
  return res
}

function createTranslationsTree (content, getNode) {
  const translations = { global: {}, local: {} }
  content.forEach(({ relativeDirectory, fields, children: [{ id, body }] }) => {
    const { locale, global, name } = fields[FIELD_NAME]
    const tree = global ? translations.global : translations.local
    const branch = tree[relativeDirectory] || {}
    const parsed = id ? { ...(getNode(id).frontmatter), mdxId: id } : JSON.parse(body)
    const primary = name === 'index' && !Array.isArray(parsed)
    const data = primary ? parsed : { [name]: parsed }
    tree[relativeDirectory] = { ...branch, [locale]: { ...branch[locale], ...data } }
  })
  return translations
}

function skipGeneration ({ locals, isDefaultLocale, relativePath, generateMissing }) {
  if (generateMissing === true || isDefaultLocale || locals._localized) {
    return false
  }
  if (Array.isArray(generateMissing)) {
    if (generateMissing.indexOf('.yaml') >= 0 && !locals.mdx) {
      return false
    }
    if (generateMissing.indexOf('.md') >= 0 && locals.mdx) {
      return false
    }
    if (generateMissing.find((p) => relativePath.startsWith(p))) {
      return false
    }
  }
  return true
}

function findTemplate (templates, relativePath, isMdx) {
  const fragments = relativePath === '' ? ['index'] : relativePath.split('/')
  const exactMatch = templates[`${fragments.join('/')}.js`]
  if (exactMatch) {
    return exactMatch
  }
  const lookups = isMdx ? [DEFAULT_MDX_TEMPLATE, DEFAULT_TEMPLATE] : [DEFAULT_TEMPLATE]
  for (let i = 1; i <= fragments.length + 1; i++) {
    for (let j = 0; j < lookups.length; j++) {
      const query = i === fragments.length + 1 ? lookups[j] : `${[...fragments, null].slice(0, -i).join('/')}/${lookups[j]}`
      const match = templates[query]
      if (match) {
        return match
      }
    }
  }
}

module.exports = {
  createTranslationsTree,
  merge,
  camelCase,
  getGlobals,
  skipGeneration,
  getConfig,
  findTemplate,
  constants: {
    CONTENT_KEY,
    COLLECTION,
    YAML,
    MARKDOWN,
    PLUGIN_NAME,
    TEMPLATES_KEY,
    FIELD_NAME,
    DEFAULT_TEMPLATE
  }
}
