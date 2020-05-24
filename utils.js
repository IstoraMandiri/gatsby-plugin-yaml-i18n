const crypto = require("crypto");

const PLUGIN_NAME = "yaml-i18n";
const TEMPLATES_KEY = `${PLUGIN_NAME}-templates`;
const CONTENT_KEY = `${PLUGIN_NAME}-content`;
const YAML = "yaml";
const MARKDOWN = "markdown";
const GLOBAL = "global";
const COLLECTION = "collection";
const KEYSTORE = "keystore";
const DEFAULT_TEMPLATE = "_default.js";
const DEFAULT_MDX_TEMPLATE = "_markdown.js";
const NODE_TYPE = "yamlI18n";
const ALL_NODE_TYPE = "allYamlI18N";

const defaultConfig = {
  locales: undefined,
  defaultLocale: undefined,
  generateMissing: false,
};

function hash(str) {
  return crypto.createHash("md5").update(str).digest("hex");
}

function getConfig(passedConfig) {
  if (!Array.isArray(passedConfig.locales)) {
    throw new Error("You must specify a `locales` array in plugin options");
  }
  return {
    ...defaultConfig,
    ...passedConfig,
    defaultLocale: passedConfig.defaultLocale || passedConfig.locales[0],
  };
}

function camelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function getGlobals(tree, path, locale) {
  return Object.keys(tree).reduce(
    (o, k) => (path.startsWith(k) ? { ...o, ...tree[k][locale] } : o),
    {}
  );
}

function merge(o, n) {
  if (o === undefined) {
    return n;
  }
  if (n === undefined) {
    return o;
  }
  if (["string", "boolean", "number", "bigint"].indexOf(typeof n) >= 0) {
    return n;
  }
  if (n instanceof Date) {
    return n;
  }
  // use `key` in arrays to match
  if (Array.isArray(o)) {
    if (!n) {
      return o;
    }
    return o.map((item) => {
      if (!item.key) {
        return item;
      }
      const match = Array.isArray(n) ? n.find(({ key }) => key === item.key) : n[item.key];
      return merge(item, match);
    });
  }
  // if it's an object...
  const res = {};
  Object.keys(o).forEach((key) => {
    if (n[key] !== undefined) {
      res._localized = true;
    }
    res[key] = merge(o[key], n[key]);
  });
  return res;
}

function inflateKeyStore({ locale, json }, translations) {
  const fileExt = `${locale}.yaml`;
  const parsed = JSON.parse(json);
  Object.keys(parsed).forEach((k) => {
    const [sig] = k.split("/").slice(-1);
    const value = parsed[k];
    const _fileName = k.split("/").slice(0, -1);
    const fileName = `${_fileName.join("/")}.${fileExt}`;
    const relativeDirectory = fileName.split("/").slice(0, -1).join("/");
    const [key] = fileName.split("/").pop().split(".");
    const isIndex = key === "index";
    let path = sig.split("__");
    if (!isIndex) {
      path = [camelCase(key), ...path];
    }
    const global = fileName.includes(".global.");
    path = [global ? "global" : "local", relativeDirectory, locale, ...path];
    path.reduce((o, k, i) => {
      const u = i === path.length - 1 ? value : {};
      o[k] = o[k] ? o[k] : u;
      return o[k];
    }, translations);
  });
}

function createTranslationsTree(content) {
  const translations = { global: {}, local: {} };
  content
    .filter((t) => t.type !== KEYSTORE)
    .forEach(({ relativeDirectory, locale, name, global, json: _json, mdxId }) => {
      const tree = global ? translations.global : translations.local;
      const branch = tree[relativeDirectory] || {};
      const json = JSON.parse(_json);
      const parsed = mdxId ? { ...json, mdxId } : json;
      const primary = name === "index" && !Array.isArray(parsed);
      const data = primary ? parsed : { [name]: parsed };
      tree[relativeDirectory] = { ...branch, [locale]: { ...branch[locale], ...data } };
    });
  content
    .filter((t) => t.type === KEYSTORE)
    .forEach((item) => {
      inflateKeyStore(item, translations);
    });
  // console.log(">>", JSON.stringify(translations));
  // throw new Error("done");
  return translations;
}

function skipGeneration({ locals, isDefaultLocale, relativePath, generateMissing }) {
  if (relativePath === "" || generateMissing === true || isDefaultLocale || locals._localized) {
    return false;
  }
  if (Array.isArray(generateMissing)) {
    if (generateMissing.indexOf(".yaml") >= 0 && !locals.mdxId) {
      return false;
    }
    if (generateMissing.indexOf(".md") >= 0 && locals.mdxId) {
      return false;
    }
    if (generateMissing.find((p) => relativePath.startsWith(p))) {
      return false;
    }
  }
  return true;
}

function findTemplate(templates, relativePath, isMdx) {
  const fragments = relativePath === "" ? ["index"] : relativePath.split("/");
  const exactMatch = templates[`${fragments.join("/")}.js`];
  if (exactMatch) {
    return exactMatch;
  }
  const lookups = isMdx ? [DEFAULT_MDX_TEMPLATE, DEFAULT_TEMPLATE] : [DEFAULT_TEMPLATE];
  for (let i = 1; i <= fragments.length + 1; i++) {
    for (let j = 0; j < lookups.length; j++) {
      const query =
        i === fragments.length + 1
          ? lookups[j]
          : `${[...fragments, null].slice(0, -i).join("/")}/${lookups[j]}`;
      const match = templates[query];
      if (match) {
        return match;
      }
    }
  }
}

module.exports = {
  createTranslationsTree,
  hash,
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
    DEFAULT_TEMPLATE,
    GLOBAL,
    NODE_TYPE,
    KEYSTORE,
    ALL_NODE_TYPE,
  },
};
