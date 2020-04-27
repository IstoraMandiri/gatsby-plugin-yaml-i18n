import React from 'react'
import { Link } from 'gatsby'

import i18nContext from './i18nContext'

const I18nLink = ({ to: _to, ...props }) => {
  const { linkPrefix } = React.useContext(i18nContext)
  const to = `${linkPrefix}${_to}`
  return <Link {...props} to={to} />
}

export default I18nLink
