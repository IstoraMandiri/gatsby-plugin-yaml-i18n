const crypto = require('crypto')
const jsYaml = require('js-yaml')

const {
  constants: {
    CONTENT_KEY,
    COLLECTION,
    YAML,
    MARKDOWN,
    PLUGIN_NAME,
    TEMPLATES_KEY,
    FIELD_NAME,
    DEFAULT_TEMPLATE
  }, ...utils
} = require('./utils')

// here we just locate and tag relevant nodes
exports.onCreateNode = async ({
  node,
  getNode,
  loadNodeContent,
  actions: { createNode, createParentChildLink, createNodeField }
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
  if (_locale && ['global', 'collection'].indexOf(_type) === -1) {
    throw Error(`Invalid type '${_type}' set on`, node)
  }
  // populate fields for querying
  const collection = _type === 'collection'
  const directory = node.relativeDirectory
  const parentDirectory = node.relativeDirectory.split('/').slice(0, -1).join('/')
  const fields = {
    name: utils.camelCase(_name),
    global: _type === 'global',
    locale: _locale || _type,
    injected: !collection, // yaml and markdown have refs injected into page context
    type: collection ? COLLECTION : node.extension === 'yaml' ? YAML : MARKDOWN
  }
  // add fields to child MDX for convenience in queries
  if (fields.type === MARKDOWN) {
    const mdxNode = getNode(node.children[0])
    createNodeField({
      node: mdxNode,
      name: FIELD_NAME,
      value: { locale: fields.locale, directory, parentDirectory }
    })
  }
  // create child YAML nodes
  if (node.extension === 'yaml') {
    const parsedYaml = jsYaml.load(await loadNodeContent(node));
    (collection ? parsedYaml : [parsedYaml]).forEach((content, index) => {
      const body = JSON.stringify(content)
      const nodeData = {
        id: `${PLUGIN_NAME}-${node.relativePath}${collection ? `-${index}` : ''}`,
        body,
        directory,
        parentDirectory,
        key: content.key,
        parent: node.id,
        locale: fields.locale,
        ...(collection && { index, content, name: fields.name }),
        internal: {
          type: fields.type,
          contentDigest: crypto.createHash('md5').update(body).digest('hex')
        }
      }
      createNode(nodeData)
      createParentChildLink({ parent: node, child: nodeData })
    })
  }
  // update the parent node for querying later
  createNodeField({ node, name: FIELD_NAME, value: fields })
}

exports.createPages = async ({ graphql, getNode, actions: { createPage } }, passedConfig) => {
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
      content: allFile(filter: {fields: {${FIELD_NAME}: {injected: {eq: true}}}}) {
        nodes {
          relativeDirectory
          fields {
            ${FIELD_NAME} {
              locale
              name
              global
            }
          }
          children {
            ... on ${YAML} {
              body
            }
            ... on Mdx {
              id
            }
          }
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
  const translations = utils.createTranslationsTree(content, getNode)
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
    locales.forEach((locale) => {
      // generate local specific context
      const isDefaultLocale = locale === defaultLocale
      const linkPrefix = isDefaultLocale ? '' : `${locale}/`
      const thisPath = `/${linkPrefix}${relativePath}`
      const globals = isDefaultLocale ? defaultGlobals : utils.merge(defaultGlobals, utils.getGlobals(translations.local, relativePath, locale))
      const _locals = isDefaultLocale ? defaultLocals : utils.merge(defaultLocals, (translations.local[relativePath] || {})[locale])
      const { mdxId, ...locals } = _locals
      // skip markdown page creation if it wasn't translated, unless overridden
      if (utils.skipGeneration({ locals, isDefaultLocale, relativePath, generateMissing })) {
        return
      }
      createPage({
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
      })
    })
  })
}
