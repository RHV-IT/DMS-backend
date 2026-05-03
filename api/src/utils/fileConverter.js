const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * File conversion utilities for scanner workflow
 * 
 * Supports:
 * - Image (JPG/PNG/TIFF/BMP) → PDF
 * - Image → Image (format conversion)
 * - PDF → PDF (pass-through)
 */

class FileConverter {
  /**
   * Convert a file to the target format
   * @param {string} inputPath - Path to source file
   * @param {string} targetFormat - 'pdf', 'jpg', 'jpeg', 'png'
   * @param {Object} options - Conversion options
   * @returns {Promise<{buffer: Buffer, format: string, mimeType: string}>}
   */
  static async convert(inputPath, targetFormat, options = {}) {
    const inputExt = path.extname(inputPath).toLowerCase().replace('.', '');
    const isImage = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp'].includes(inputExt);
    const isPDF = inputExt === 'pdf';

    // If no conversion needed, return original
    if (inputExt === targetFormat) {
      const buffer = await fs.promises.readFile(inputPath);
      return {
        buffer,
        format: targetFormat,
        mimeType: this.getMimeType(targetFormat)
      };
    }

    // Image → PDF
    if (isImage && targetFormat === 'pdf') {
      return this.imageToPdf(inputPath, options);
    }

    // Image → Image (conversion)
    if (isImage && this.isImageFormat(targetFormat)) {
      return this.convertImage(inputPath, targetFormat, options);
    }

    // PDF → PDF (no conversion needed)
    if (isPDF && targetFormat === 'pdf') {
      const buffer = await fs.promises.readFile(inputPath);
      return {
        buffer,
        format: 'pdf',
        mimeType: 'application/pdf'
      };
    }

    // PDF → Image (not supported in this basic version)
    if (isPDF && this.isImageFormat(targetFormat)) {
      throw new Error('PDF to image conversion requires additional dependencies (pdf-poppler or ghostscript). Not implemented.');
    }

    throw new Error(`Unsupported conversion: ${inputExt} → ${targetFormat}`);
  }

  /**
   * Convert image(s) to PDF
   */
  static async imageToPdf(inputPath, options = {}) {
    const imageBuffer = await fs.promises.readFile(inputPath);
    const imageMetadata = await sharp(inputPath).metadata();

    // Create PDF
    const doc = new PDFDocument({
      size: options.pageSize || 'a4',
      margin: options.margin || 0
    });

    // Buffer to hold PDF
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    const result = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // Get image dimensions
    const { width, height } = imageMetadata;

    // Set page size to match image dimensions (max A4)
    const mmPerInch = 25.4;
    const pointsPerMM = 72 / 25.4; // 72 points per inch
    const imgWidthPt = width * (72 / imageMetadata.density || 72) / 96; // Approximate
    const imgHeightPt = height * (72 / imageMetadata.density || 72) / 96;

    // For simplicity, use default A4 and scale image to fit
    const a4Width = 595; // 210mm × 72/25.4 ≈ 595pt
    const a4Height = 842; // 297mm × 72/25.4 ≈ 842pt

    doc.addPage({ size: [a4Width, a4Height] });
    
    // Center and fit image
    const scale = Math.min(a4Width / width, a4Height / height) * 0.95;
    const x = (a4Width - width * scale) / 2;
    const y = (a4Height - height * scale) / 2;

    doc.image(imageBuffer, x, y, {
      width: width * scale,
      height: height * scale
    });

    doc.end();

    const pdfBuffer = await result;

    return {
      buffer: pdfBuffer,
      format: 'pdf',
      mimeType: 'application/pdf'
    };
  }

  /**
   * Convert image to different image format
   */
  static async convertImage(inputPath, targetFormat, options = {}) {
    let transformer = sharp(inputPath);

    // Apply format-specific options
    if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
      transformer = transformer.jpeg({
        quality: options.quality || 90,
        chromaSubsampling: '4:4:4'
      });
    } else if (targetFormat === 'png') {
      transformer = transformer.png({
        compressionLevel: options.compressionLevel || 6,
        quality: options.quality || 90
      });
    } else if (targetFormat === 'tiff') {
      transformer = transformer.tiff({
        compression: options.compression || 'deflate'
      });
    } else if (targetFormat === 'bmp') {
      transformer = transformer.bmp();
    } else if (targetFormat === 'webp') {
      transformer = transformer.webp({
        quality: options.quality || 90
      });
    }

    const buffer = await transformer.toBuffer();
    
    return {
      buffer,
      format: targetFormat,
      mimeType: this.getMimeType(targetFormat)
    };
  }

  /**
   * Check if format is an image type
   */
  static isImageFormat(format) {
    return ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'gif', 'webp'].includes(format.toLowerCase());
  }

  /**
   * Get MIME type for format
   */
  static getMimeType(format) {
    const mimeMap = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'tiff': 'image/tiff',
      'tif': 'image/tiff',
      'bmp': 'image/bmp',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return mimeMap[format.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get file extension from MIME type
   */
  static getExtensionFromMime(mimeType) {
    const extMap = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
      'image/bmp': 'bmp',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    return extMap[mimeType] || 'bin';
  }

  /**
   * Check if file is convertible to target format
   */
  static canConvert(fromExt, toExt) {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    const imageFormats = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp', 'gif', 'webp'];

    // PDF can only stay PDF (no conversion to image)
    if (from === 'pdf' && to !== 'pdf') return false;

    // Images can become PDF
    if (imageFormats.includes(from) && to === 'pdf') return true;

    // Images can convert to other images
    if (imageFormats.includes(from) && imageFormats.includes(to)) return true;

    return false;
  }
}

module.exports = FileConverter;
