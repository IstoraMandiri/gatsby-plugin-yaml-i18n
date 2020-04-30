import React from 'react'

import i18nContext from './i18nContext'

const withI18n = () => Comp => {
  return props => {
    // parse json and create locale context
    const { pageContext: { locale, linkPrefix } } = props
    // const pageContext = !i18n ? _pc : { ..._pc, i18n: JSON.parse(i18n) }
    // const children = { ...props.children, props: { ...props.children.props, pageContext } }
    return (
      <i18nContext.Provider value={{ locale, linkPrefix }}>
        <Comp {...props} />
      </i18nContext.Provider>
    )
  }
}

export default withI18n
