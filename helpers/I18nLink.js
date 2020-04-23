import React from 'react'
import { Link } from 'gatsby'

import i18nContext from './i18nContext'

const I18nLink = ({ to: _to, ...props }) => {
  const { i18nLinkPrefix } = React.useContext(i18nContext)
  const to = `${i18nLinkPrefix}${_to}`
  return <Link {...props} to={to} />
}

export default I18nLink
