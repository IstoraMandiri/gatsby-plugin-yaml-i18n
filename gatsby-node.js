const jsYaml = require('js-yaml')

const {
  constants: {
    CONTENT_KEY,
    COLLECTION,
    YAML,
    MARKDOWN,
    PLUGIN_NAME,
    TEMPLATES_KEY,
    GLOBAL,
    NODE_TYPE,
    ALL_NODE_TYPE,
    DEFAULT_TEMPLATE
  }, ...utils
} = require('./utils')

// here we just locate and tag relevant nodes
exports.onCreateNode = async ({
  node,
  getNode,
  loadNodeContent,
  actions: { createNode, createParentChildLink }
}) => {
  // only deal with the files we care about...
  if (
    node.sourceInstanceName !== CONTENT_KEY ||
    ['mdx', 'md', 'yaml'].indexOf(node.extension) === -1
  ) {
    return
  }
  // parse file name
  const [_name, _type, _locale] = node.name.split('.')
  // throw invalid types
  if (_locale && [GLOBAL, COLLECTION].indexOf(_type) === -1) {
    throw Error(`Invalid type '${_type}' set on`, node)
  }
  // populate fields for querying
  const collection = _type === COLLECTION
  const type = collection ? COLLECTION : node.extension === 'yaml' ? YAML : MARKDOWN
  const fields = {
    type,
    id: `${PLUGIN_NAME}-${type}-${node.relativePath}`,
    name: utils.camelCase(_name),
    global: _type === GLOBAL,
    locale: _locale || _type,
    injected: !collection, // yaml and markdown have refs injected into page context
    relativeDirectory: node.relativeDirectory,
    parentDirectory: node.relativeDirectory.split('/').slice(0, -1).join('/')
  }
  // add fields to child MDX for convenience in queries
  if (fields.type === MARKDOWN) {
    const mdxNode = getNode(node.children[0])
    const data = mdxNode.frontmatter
    const json = JSON.stringify(data)
    const nodeData = {
      ...fields,
      json,
      data,
      mdxId: mdxNode.id,
      parent: mdxNode.id,
      internal: {
        type: NODE_TYPE,
        contentDigest: utils.hash(json)
      }
    }
    createNode(nodeData)
    createParentChildLink({ parent: mdxNode, child: nodeData })
  }
  // create child YAML nodes
  if (node.extension === 'yaml') {
    const parsedYaml = jsYaml.load(await loadNodeContent(node));
    (collection ? parsedYaml : [parsedYaml]).forEach((_data, index) => {
      // cast date to a string to make it queryable similar to mdx
      const date = _data.date instanceof Date ? _data.date.toISOString() : _data.date
      const data = _data.date ? { ..._data, date } : _data
      const json = JSON.stringify(data)
      const nodeData = {
        ...fields,
        id: `${fields.id}${collection ? `-${index}` : ''}`,
        json,
        key: data.key,
        parent: node.id,
        ...(collection && { index, data }),
        internal: {
          type: NODE_TYPE,
          contentDigest: utils.hash(json)
        }
      }
      createNode(nodeData)
      createParentChildLink({ parent: node, child: nodeData })
    })
  }
}

exports.createPages = async ({ graphql, actions: { createPage } }, passedConfig) => {
  // query content, pages and templates
  const {
    data: {
      pages: { nodes: pages },
      templates: { nodes: _templates },
      content: { nodes: content }
    }
  } = await graphql(`
    query {
      pages: allDirectory(filter: { sourceInstanceName: { eq: "${CONTENT_KEY}"} }) {
        nodes {
            relativePath
          }
      }
      templates: allFile(filter: { sourceInstanceName: { eq: "${TEMPLATES_KEY}"} }) {
        nodes {
            relativePath
            absolutePath
          }
      }
      content: ${ALL_NODE_TYPE}(filter: { injected: { eq: true } }) {
        nodes {
          relativeDirectory
          locale
          name
          global
          mdxId
          json
        }
      }
    }
  `)

  if (pages.length === 0) {
    throw Error(`Could not find any content! Did you specify 'gatsby-source-filesystem' with name: '${CONTENT_KEY}'?`)
  }
  if (_templates.length === 0) {
    throw Error(`Could not find any templates! Did you specify 'gatsby-source-filesystem' with name: '${TEMPLATES_KEY}'?`)
  }
  // transform into key / vals
  const templates = _templates.reduce((o, { relativePath: r, absolutePath: a }) => ({ ...o, [r]: a }), {})
  // get translations
  const translations = utils.createTranslationsTree(content)
  // resolve config
  const { defaultLocale, locales, generateMissing } = utils.getConfig(passedConfig)
  // create the pages
  pages.forEach(({ relativePath }) => {
    const defaultGlobals = utils.getGlobals(translations.global, relativePath, defaultLocale)
    const defaultLocals = (translations.local[relativePath] || {})[defaultLocale] || {}
    const { mdxId } = defaultLocals
    const component = utils.findTemplate(templates, relativePath, mdxId)
    if (!component) {
      throw Error(`Could not find template for ${relativePath}. Did you create a ${DEFAULT_TEMPLATE} file?`)
    }
    // console.log(`${relativePath} --> ${component}`)
    locales.forEach((locale) => {
      // generate local specific context
      const isDefaultLocale = locale === defaultLocale
      const linkPrefix = isDefaultLocale ? '' : `/${locale}`
      const thisPath = `${linkPrefix}/${relativePath}`
      const globals = isDefaultLocale ? defaultGlobals : utils.merge(defaultGlobals, utils.getGlobals(translations.local, relativePath, locale))
      const _locals = isDefaultLocale ? defaultLocals : utils.merge(defaultLocals, (translations.local[relativePath] || {})[locale])
      const { mdxId, ...locals } = _locals
      // skip markdown page creation if it wasn't translated, unless overridden
      if (utils.skipGeneration({ locals, isDefaultLocale, relativePath, generateMissing })) {
        return
      }
      const pageData = {
        path: thisPath,
        component,
        context: {
          locale,
          linkPrefix,
          locales,
          isDefaultLocale,
          defaultLocale,
          relativePath,
          mdxId,
          i18n: {
            ...locals,
            globals
          }
        }
      }
      createPage(pageData)
    })
  })
}
