import React from 'react'

import i18nContext from './i18nContext'

const withI18n = () => Comp => {
  return props => {
    const { pageContext: { locale, linkPrefix: i18nLinkPrefix } } = props
    return (
      <i18nContext.Provider value={{ locale, i18nLinkPrefix }}>
        <Comp {...props} />
      </i18nContext.Provider>
    )
  }
}

export default withI18n
