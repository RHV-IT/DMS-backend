/**
 * SCANNER FILE BADGE - React Component
 * 
 * Usage: import { ScannerBadge } from './ScannerBadge';
 * 
 * <ScannerBadge file={file} />
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * Displays a badge if the file came from a scanner upload
 */
export const ScannerBadge = ({ file, showLabel = true }) => {
  if (!file || file.uploadSource !== 'scanner') {
    return null;
  }

  return (
    <span className="scanner-badge" title="Scanned document">
      {showLabel ? <span className="badge-text">Scanner</span> : '📄'}
    </span>
  );
};

ScannerBadge.propTypes = {
  file: PropTypes.object.isRequired,
  showLabel: PropTypes.bool
};

/**
 * Usage examples:
 * 
 * 1. With label:
 *    <ScannerBadge file={file} />
 *    Renders: <span className="scanner-badge">Scanner</span>
 * 
 * 2. Icon only:
 *    <ScannerBadge file={file} showLabel={false} />
 *    Renders: 📄
 */

export default ScannerBadge;
