# gatsby-plugin-yaml-i18n

A YAML-based i18n plugin for gatsby.

This plugin provides an flexible, scalable and developer-friendly approach to i18n in gatsby projects.

## Setup

To start from scratch, install the starter project:

```
# THIS IS NOT READY YET, DO NOT USE IT!
gatsby new https://github.com/hitchcott/gatsby-starter-yaml-i18n
```

To implement in your existing project:

```bash
npm i gatsby-plugin-yaml-i18n
```

```javascript
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        path: `${__dirname}/content`,
        name: 'yaml-i18n-content'
      }
    },
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        path: `${__dirname}/src/templates`,
        name: 'yaml-i18n-templates'
      }
    },
    {
      resolve: 'gatsby-plugin-yaml-i18n',
      options: {
        locales: ['en']
      }
    }
  ]}
}
```

## Examples

- See https://github.com/hitchcott/gatsby-starter-yaml-i18n for a basic implementatiosn
- See https://github.com/ethereumclassic/ethereumclassic.github.io for an in depth implementation.

## Documentation

Detailed documentation is to come. Sorry! See the examples for now.
