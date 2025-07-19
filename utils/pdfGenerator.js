const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const axios = require('axios');

/**
 * Helper function to download an image from a URL
 * @param {string} url - URL of the image to download
 * @returns {Promise<string>} - Path to the downloaded image
 */
const downloadImage = (url) => {
  return new Promise((resolve, reject) => {
    console.log(`Downloading image from URL: ${url}`);
    
    // If the URL is missing or invalid, reject
    if (!url || typeof url !== 'string') {
      return reject(new Error('Invalid image URL'));
    }
    
    // Handle different URL types
    const isHttpUrl = url.startsWith('http://') || url.startsWith('https://');
    const isCloudinaryUrl = url.includes('cloudinary.com');
    
    // If it's a local file, just return the path
    if (!isHttpUrl) {
      const localPath = path.isAbsolute(url) ? url : path.join(__dirname, '..', url);
      console.log(`Checking local file: ${localPath}`);
      if (fs.existsSync(localPath)) {
        console.log(`Local file exists: ${localPath}`);
        return resolve(localPath);
      } else {
        console.log(`Local file not found: ${localPath}`);
        return reject(new Error(`Local file not found: ${localPath}`));
      }
    }
    
    // Create a temp file to store the image
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`Created temp directory: ${tempDir}`);
    }
    
    const tempFilePath = path.join(tempDir, `image_${Date.now()}.jpg`);
    const fileStream = fs.createWriteStream(tempFilePath);
    console.log(`Created write stream for temp file: ${tempFilePath}`);
    
    // For HTTP/HTTPS URLs, download the file
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`Using ${url.startsWith('https') ? 'HTTPS' : 'HTTP'} protocol to download`);
    
    // Special handling for Cloudinary URLs
    let requestUrl = url;
    if (isCloudinaryUrl) {
      // Ensure we're getting the best quality image for the PDF
      console.log('Detected Cloudinary URL, adjusting for PDF quality');
      
      // Remove any existing transformations and add quality settings
      const urlParts = url.split('/upload/');
      if (urlParts.length === 2) {
        requestUrl = `${urlParts[0]}/upload/q_80,fl_progressive/${urlParts[1]}`;
        console.log(`Adjusted Cloudinary URL: ${requestUrl}`);
      }
    }
    
    console.log(`Making request to: ${requestUrl}`);
    protocol.get(requestUrl, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`Redirect detected to: ${response.headers.location}`);
        // Clean up the current file stream
        fileStream.end();
        fs.unlink(tempFilePath, (err) => {
          if (err) console.error(`Error deleting temporary file during redirect: ${err.message}`);
        });
        
        return downloadImage(response.headers.location)
          .then(resolve)
          .catch(reject);
      }
      
      // Check if the response is successful
      if (response.statusCode !== 200) {
        console.error(`Failed to download image: ${response.statusCode}`);
        // Clean up the file stream
        fileStream.end();
        fs.unlink(tempFilePath, (err) => {
          if (err) console.error(`Error deleting temporary file after failed download: ${err.message}`);
        });
        
        return reject(new Error(`Failed to download image: ${response.statusCode}`));
      }
      
      console.log(`Downloading image to: ${tempFilePath}`);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        console.log(`Image download completed: ${tempFilePath}`);
        
        // Check if the file actually has content
        fs.stat(tempFilePath, (err, stats) => {
          if (err) {
            console.error(`Error checking downloaded file: ${err.message}`);
            return reject(err);
          }
          
          if (stats.size === 0) {
            console.error('Downloaded file is empty');
            fs.unlink(tempFilePath, () => {});
            return reject(new Error('Downloaded file is empty'));
          }
          
          console.log(`Image downloaded successfully (${stats.size} bytes)`);
          resolve(tempFilePath);
        });
      });
      
      fileStream.on('error', (error) => {
        console.error(`Error writing to file stream: ${error.message}`);
        reject(error);
      });
    }).on('error', (error) => {
      console.error(`Network error: ${error.message}`);
      fileStream.end();
      reject(error);
    });
  });
};

/**
 * Alternative method to download images using axios
 * This is a faster method for most cases
 * @param {string} url - The URL of the image to download
 * @returns {Promise<string>} - Path to the downloaded image
 */
const downloadImageWithAxios = async (url) => {
  try {
    // If it's a local file, just return the path
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const localPath = path.isAbsolute(url) ? url : path.join(__dirname, '..', url);
      if (fs.existsSync(localPath)) {
        return localPath;
      } else {
        throw new Error(`Local file not found: ${localPath}`);
      }
    }
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a temporary file
    const tempFilePath = path.join(tempDir, `image_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`);
    
    // Download the image
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer'
    });
    
    // Determine file extension from content type
    const contentType = response.headers['content-type'];
    let extension = 'jpg';
    if (contentType) {
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
      else if (contentType.includes('gif')) extension = 'gif';
    }
    
    // Update file path with correct extension
    const finalPath = tempFilePath.replace(/\.[^/.]+$/, `.${extension}`);
    
    // Write the file
    await fs.promises.writeFile(finalPath, response.data);
    
    return finalPath;
  } catch (error) {
    console.error(`Error downloading image with Axios: ${error.message}`);
    throw error;
  }
};

/**
 * Core PDF generation function with professional design
 * @param {Object} data - Report data
 * @param {string} outputPath - Where to save the PDF
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Path to the generated PDF
 */
async function generatePdf(data, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Starting professional PDF generation process...');
      
      // Create a document with better defaults
      const doc = new PDFDocument({ 
        autoFirstPage: true,
        margins: { top: 72, bottom: 72, left: 72, right: 72 },
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Medical Report - ${data.reportNumber || 'Medical Report'}`,
          Author: 'Clinic Management System',
          Subject: `${data.type || 'Medical'} Report`,
          Keywords: 'medical, report, clinic, healthcare',
          CreationDate: new Date()
        }
      });
      
      // Pipe output to a file
      const outStream = fs.createWriteStream(outputPath);
      doc.pipe(outStream);
      
      // Define colors and styles
      const colors = {
        primary: '#0f766e',   // Teal 700
        secondary: '#0284c7', // Sky 600
        heading: '#1e293b',   // Slate 800
        subheading: '#334155', // Slate 700
        text: '#475569',      // Slate 600
        light: '#f1f5f9',     // Slate 100
        border: '#cbd5e1',    // Slate 300
        subtle: '#94a3b8'     // Slate 400
      };
      
      const drawHeader = () => {
        // Draw colored header area
        doc.fillColor(colors.primary)
           .rect(0, 0, doc.page.width, 60)
           .fill();
        
        // Try to add hospital logo first
        if (data.hospital?.logo) {
          try {
            let logoY = 10;
            let logoHeight = 40;
            
            // Add logo placeholder or hospital name
            doc.fillColor('white')
               .font('Helvetica-Bold')
               .fontSize(22)
               .text(data.hospital?.name || 'Medical Center', 150, 20);
            
          } catch (logoError) {
            console.error('Error adding hospital logo:', logoError);
            
            // Fall back to just showing hospital name
            doc.fillColor('white')
               .font('Helvetica-Bold')
               .fontSize(22)
               .text(data.hospital?.name || 'Medical Center', 72, 20);
          }
        } else {
          // Add hospital name without logo
          doc.fillColor('white')
             .font('Helvetica-Bold')
             .fontSize(22)
             .text(data.hospital?.name || 'Medical Center', 72, 20);
        }
        
        // Add header text
        if (data.hospital) {
          doc.font('Helvetica')
             .fontSize(10)
             .text(data.hospital.address || '', doc.page.width - 250, 20, { align: 'right' })
             .text(data.hospital.contact || '', doc.page.width - 250, 35, { align: 'right' });
        }
      };
      
      const drawFooter = (pageNumber, totalPages) => {
        const footerTop = doc.page.height - 50;
        
        // Footer separator line
        doc.strokeColor(colors.border)
           .lineWidth(0.5)
           .moveTo(72, footerTop - 10)
           .lineTo(doc.page.width - 72, footerTop - 10)
           .stroke();
        
        // Footer text
        doc.fillColor(colors.subtle)
           .fontSize(8)
           .font('Helvetica')
           .text(
             'This is an official medical report document generated by the Clinic Management System.',
             72, footerTop
           );
        
        // Page numbers
        doc.text(
          `Page ${pageNumber} of ${totalPages}`,
          doc.page.width - 150, footerTop,
          { align: 'right' }
        );
        
        // Generated date
        doc.text(
          `Generated on: ${new Date().toLocaleString()}`, 
          72, footerTop + 12
        );
      };
      
      // Draw the main header
      drawHeader();
      
      // Add main title
      doc.moveDown(3)
         .fillColor(colors.heading)
         .font('Helvetica-Bold')
         .fontSize(20)
         .text('MEDICAL REPORT', { align: 'center' });
      
      // Add report number
      doc.moveDown(0.5)
         .fillColor(colors.secondary)
         .fontSize(12)
         .text(`#${data.reportNumber || 'N/A'}`, { align: 'center' });
      
      doc.moveDown(2);
      
      // Create a two-column section for key details
      const topSectionY = doc.y;
      const columnWidth = (doc.page.width - 144) / 2;
      
      // Left Column: Report Details & Patient Info
      doc.x = 72;
      doc.y = topSectionY;
      
      // Report details section (left column)
      createInfoSection(doc, 'Report Details', [
        { label: 'Report Number', value: data.reportNumber || 'N/A' },
        { label: 'Date', value: formatDate(data.date) },
        { label: 'Report Type', value: data.type ? capitalizeFirstLetter(data.type) : 'Medical' }
      ], colors, columnWidth);
      
      doc.moveDown(1);
      
      // Patient information (left column)
      if (data.patient) {
        createInfoSection(doc, 'Patient Information', [
          { label: 'Name', value: data.patient.name || 'N/A' },
          { label: 'ID', value: data.patient._id || 'N/A' },
          { label: 'Gender', value: data.patient.gender || 'N/A' },
          { label: 'Age', value: data.patient.age || 'N/A' },
          { label: 'Blood Type', value: data.patient.blood || 'N/A' }
        ], colors, columnWidth);
      }
      
      // Right Column: Doctor & Hospital Info
      doc.x = 72 + columnWidth + 20;
      doc.y = topSectionY;
      
      // Doctor information (right column)
      if (data.doctor) {
        createInfoSection(doc, 'Doctor Information', [
          { label: 'Name', value: data.doctor.name || 'N/A' },
          { label: 'Specialization', value: data.doctor.specialization || 'N/A' }
        ], colors, columnWidth);
      }
      
      doc.moveDown(1);
      
      // Hospital information (right column)
      if (data.hospital) {
        createInfoSection(doc, 'Hospital Information', [
          { label: 'Name', value: data.hospital.name || 'N/A' },
          { label: 'Address', value: data.hospital.address || 'N/A' },
          { label: 'Contact', value: data.hospital.contact || 'N/A' }
        ], colors, columnWidth);
      }
      
      // Reset position for full-width sections
      doc.x = 72;
      doc.moveDown(2);
      
      // Clinical information sections (full width)
      const clinicalY = doc.y;
      
      // Diagnosis section
      createClinicalSection(doc, 'Diagnosis', data.diagnosis || 'No diagnosis information provided', colors);
      
      // Prescription section
      createClinicalSection(doc, 'Prescription', data.prescription || 'No prescription information provided', colors);
      
      // Notes section (if available)
      if (data.notes) {
        createClinicalSection(doc, 'Additional Notes', data.notes, colors);
      }
      
      // Follow-up section (if available)
      if (data.followUpDate) {
        createClinicalSection(doc, 'Follow-up Information', 
          `Follow-up Date: ${formatDate(data.followUpDate)}${
            data.appointment ? `\nAppointment Type: ${data.appointment.type || 'Regular'}` : ''
          }`, 
          colors
        );
      }
      
      // Images section
      if (data.images && data.images.length > 0 || data.conditionImages && data.conditionImages.length > 0) {
        // Use whichever image array exists
        const imagesToRender = data.images && data.images.length > 0 ? data.images : data.conditionImages;
        
        // Add a page break if we're already far down the page
        if (doc.y > doc.page.height - 300) {
          doc.addPage();
          drawHeader();
          doc.moveDown(3);
        }
        
        doc.moveDown(1)
           .fillColor(colors.heading)
           .font('Helvetica-Bold')
           .fontSize(14)
           .text('Medical Images');
           
        doc.moveDown(0.5)
           .fillColor(colors.text)
           .font('Helvetica')
           .fontSize(10)
           .text('The following images were captured during examination:');
        
        doc.moveDown(1);
        
        try {
          // Try to download and add each image
          for (let i = 0; i < imagesToRender.length; i++) {
            const imageUrl = imagesToRender[i];
            console.log(`Processing image ${i+1}/${imagesToRender.length}: ${imageUrl}`);
            
            try {
              // Download image using our combined method 
              const tempImgPath = await downloadImageWithAxios(imageUrl);
              
              // Add page break if needed
              if (doc.y > doc.page.height - 250) {
                doc.addPage();
                drawHeader();
                doc.moveDown(3);
              }
              
              // Add a caption
              doc.font('Helvetica-Italic')
                 .fillColor(colors.subheading)
                 .fontSize(10)
                 .text(`Image ${i+1}:`, { continued: true })
                 .text(` ${path.basename(imageUrl)}`, { align: 'left' });
              
              doc.moveDown(0.5);
              
              // Calculate image dimensions to fit page
              const maxWidth = doc.page.width - 144;  // 72pt margins on both sides
              
              // Add the image with appropriate scale
              doc.image(tempImgPath, {
                fit: [maxWidth, 250],
                align: 'center'
              });
              
              // Clean up temp file
              if (tempImgPath.includes('temp')) {
                fs.unlinkSync(tempImgPath);
                console.log('Deleted temp image file');
              }
              
              // Add space after image
              doc.moveDown(1);
              
              // Add a separator line if not the last image
              if (i < imagesToRender.length - 1) {
                doc.strokeColor(colors.border)
                   .lineWidth(0.5)
                   .moveTo(72, doc.y)
                   .lineTo(doc.page.width - 72, doc.y)
                   .stroke();
                doc.moveDown(1);
              }
            } catch (imgError) {
              console.error(`Error processing image ${imageUrl}: ${imgError.message}`);
              doc.font('Helvetica')
                 .fillColor('red')
                 .fontSize(10)
                 .text(`Could not load image: ${path.basename(imageUrl)}`);
              doc.moveDown();
            }
          }
        } catch (imagesError) {
          console.error(`Error processing images section: ${imagesError.message}`);
          doc.font('Helvetica')
             .fillColor('red')
             .fontSize(10)
             .text('Error loading images');
        }
      }
      
      // Add signature section
      doc.moveDown(2);
      doc.strokeColor(colors.border)
         .lineWidth(0.5)
         .moveTo(72, doc.y + 10)
         .lineTo(250, doc.y + 10)
         .stroke();
      
      doc.moveDown(0.5)
         .font('Helvetica')
         .fillColor(colors.text)
         .fontSize(10)
         .text('Doctor\'s Signature', 72, doc.y);
      
      // Add disclaimers and legal text at the bottom
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
        drawHeader();
        doc.moveDown(3);
      }
      
      doc.moveDown(2)
         .font('Helvetica-Bold')
         .fillColor(colors.subheading)
         .fontSize(10)
         .text('Disclaimers & Information:');
      
      doc.moveDown(0.5)
         .font('Helvetica')
         .fillColor(colors.text)
         .fontSize(8)
         .text('This report is confidential and contains protected health information. Unauthorized access, use, or disclosure is strictly prohibited. The information in this report is intended for the patient and healthcare providers only. This document should not be used as a substitute for professional medical advice. Please consult with your healthcare provider for any questions regarding your treatment or diagnosis.');
      
      // Add footers to all pages
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        drawFooter(i + 1, pageCount);
      }
      
      // Finalize PDF
      doc.end();
      
      // Handle events
      outStream.on('finish', () => {
        // Verify file was created successfully
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            console.log(`PDF generated successfully: ${outputPath} (${stats.size} bytes)`);
            resolve(outputPath);
          } else {
            reject(new Error('Generated PDF file is empty'));
          }
        } else {
          reject(new Error('Failed to create PDF file'));
        }
      });
      
      outStream.on('error', (error) => {
        console.error(`Error in outStream: ${error.message}`);
        reject(error);
      });
      
    } catch (error) {
      console.error(`Error in generatePdf: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Create a styled information section with key-value pairs
 */
function createInfoSection(doc, title, items, colors, width) {
  // Section title
  doc.fillColor(colors.heading)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text(title);
     
  // Draw light background for the section
  const sectionY = doc.y;
  doc.fillColor(colors.light)
     .rect(doc.x, sectionY, width, items.length * 20 + 10)
     .fill();
     
  // Draw border
  doc.strokeColor(colors.border)
     .lineWidth(0.5)
     .rect(doc.x, sectionY, width, items.length * 20 + 10)
     .stroke();
  
  // Reset position for content
  doc.y = sectionY + 8;
  
  // Add content items
  items.forEach((item, index) => {
    doc.fillColor(colors.subheading)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text(`${item.label}:`, doc.x + 10, doc.y, { continued: true, width: width - 20 });
       
    doc.fillColor(colors.text)
       .font('Helvetica')
       .text(` ${item.value}`, { align: 'left' });
    
    // Don't move down explicitly, the text() method does that
    // But we want some consistent positioning
    if (index < items.length - 1) {
      doc.moveDown(0.6);
    }
  });
  
  // Move down for next section
  doc.moveDown(0.5);
}

/**
 * Create a styled clinical information section
 */
function createClinicalSection(doc, title, content, colors) {
  // Section title
  doc.fillColor(colors.heading)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text(title);
  
  doc.moveDown(0.5);
  
  // Draw content box
  const contentY = doc.y;
  const contentWidth = doc.page.width - 144; // 72pt margins on both sides
  
  // Measure text height (approximation)
  const textLines = Math.ceil(content.length / 60) + content.split('\n').length;
  const estimatedHeight = textLines * 14 + 20;
  
  // Draw box with light background
  doc.fillColor(colors.light)
     .rect(doc.x, contentY, contentWidth, estimatedHeight)
     .fill();
  
  // Draw border
  doc.strokeColor(colors.border)
     .lineWidth(0.5)
     .rect(doc.x, contentY, contentWidth, estimatedHeight)
     .stroke();
  
  // Reset position and add content
  doc.y = contentY + 10;
  doc.x = doc.x + 10;
  
  doc.fillColor(colors.text)
     .font('Helvetica')
     .fontSize(10)
     .text(content, { width: contentWidth - 20 });
  
  // Reset x position and move down for next section
  doc.x = 72;
  doc.moveDown(1.5);
}

/**
 * Format a date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  if (!date) return 'N/A';
  
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    
    // Format as DD/MM/YYYY
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    return 'Invalid Date';
  }
}

/**
 * Capitalize the first letter of each word in a string
 */
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Helper to ensure the uploads directory exists
 * @returns {string} Path to the uploads directory
 */
function ensureUploadsDir() {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory dynamically');
  }
  return uploadsDir;
}

/**
 * Generate a professional PDF medical report
 * @param {Object} data - Report data
 * @param {string} outputPath - Where to save the PDF
 * @returns {Promise<string>} - Path to the generated PDF
 */
async function generateSimplePdf(data, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Starting professional PDF generation process...');
      
      // Create a document
      const doc = new PDFDocument({ 
        autoFirstPage: true,
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Medical Report - ${data.reportNumber || 'Medical Report'}`,
          Author: 'Clinic Management System',
          Subject: `${data.type || 'Medical'} Report`,
          Keywords: 'medical, report, clinic, healthcare',
          CreationDate: new Date()
        }
      });
      
      // Pipe output to a file
      const outStream = fs.createWriteStream(outputPath);
      doc.pipe(outStream);
      
      // Basic info
      doc.font('Helvetica-Bold').fontSize(18).text('MEDICAL REPORT', { align: 'center' });
      doc.moveDown();
      
      // Report details
      doc.font('Helvetica-Bold').fontSize(12).text('Report Details');
      doc.font('Helvetica').fontSize(10);
      doc.text(`Report Number: ${data.reportNumber || 'N/A'}`);
      doc.text(`Report Date: ${formatDate(data.date)}`);
      doc.text(`Report Type: ${data.type || 'Medical'}`);
      doc.moveDown();
      
      // Patient info
      if (data.patient) {
        doc.font('Helvetica-Bold').fontSize(12).text('Patient Information');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Name: ${data.patient.name || 'N/A'}`);
        doc.text(`ID: ${data.patient._id || 'N/A'}`);
        doc.text(`Gender: ${data.patient.gender || 'N/A'}`);
        doc.text(`Age: ${data.patient.age || 'N/A'}`);
        doc.moveDown();
      }
      
      // Doctor info
      if (data.doctor) {
        doc.font('Helvetica-Bold').fontSize(12).text('Doctor Information');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Name: ${data.doctor.name || 'N/A'}`);
        doc.text(`Specialization: ${data.doctor.specialization || 'N/A'}`);
        doc.moveDown();
      }
      
      // Hospital info
      if (data.hospital) {
        doc.font('Helvetica-Bold').fontSize(12).text('Hospital Information');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Name: ${data.hospital.name || 'N/A'}`);
        doc.text(`Address: ${data.hospital.address || 'N/A'}`);
        doc.text(`Contact: ${data.hospital.contact || 'N/A'}`);
        doc.moveDown();
      }
      
      // Diagnosis
      doc.font('Helvetica-Bold').fontSize(12).text('Diagnosis');
      doc.font('Helvetica').fontSize(10);
      doc.text(data.diagnosis || 'No diagnosis information provided');
      doc.moveDown();
      
      // Prescription
      doc.font('Helvetica-Bold').fontSize(12).text('Prescription');
      doc.font('Helvetica').fontSize(10);
      doc.text(data.prescription || 'No prescription information provided');
      doc.moveDown();
      
      // Notes
      if (data.notes) {
        doc.font('Helvetica-Bold').fontSize(12).text('Additional Notes');
        doc.font('Helvetica').fontSize(10);
        doc.text(data.notes);
        doc.moveDown();
      }
      
      // Follow-up
      if (data.followUpDate) {
        doc.font('Helvetica-Bold').fontSize(12).text('Follow-up Information');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Follow-up Date: ${formatDate(data.followUpDate)}`);
        doc.moveDown();
      }
      
      // Images section
      if (data.images && data.images.length > 0) {
        doc.font('Helvetica-Bold').fontSize(12).text('Medical Images');
        doc.moveDown(0.5);
        
        try {
          // Try to download and add each image
          for (let i = 0; i < data.images.length; i++) {
            const imageUrl = data.images[i];
            console.log(`Processing image ${i+1}/${data.images.length}: ${imageUrl}`);
            
            try {
              // Download image
              const response = await require('axios')({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer'
              });
              
              // Get image extension
              const contentType = response.headers['content-type'];
              let extension = 'jpg';
              if (contentType) {
                if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
                else if (contentType.includes('gif')) extension = 'gif';
              }
              
              // Create a temp file for the image
              const tempImgPath = path.join(path.dirname(outputPath), `temp_img_${Date.now()}_${i}.${extension}`);
              await fs.promises.writeFile(tempImgPath, response.data);
              
              // Add to PDF
              doc.font('Helvetica').fontSize(9).text(`Image ${i+1}:`, { continued: true });
              doc.font('Helvetica-Oblique').text(` ${path.basename(imageUrl)}`, { align: 'left' });
              doc.moveDown(0.5);
              
              // Calculate image dimensions to fit page
              const maxWidth = 400;  // Max width for the PDF page
              
              // Add the image with appropriate scale
              doc.image(tempImgPath, {
                fit: [maxWidth, 300],
                align: 'center'
              });
              
              // Clean up temp file
              try {
                fs.unlinkSync(tempImgPath);
              } catch (cleanupErr) {
                console.error(`Error cleaning up temp image file: ${cleanupErr.message}`);
              }
              
              // Add space after image
              doc.moveDown();
              
              // Add a separator line
              if (i < data.images.length - 1) {
                doc.moveTo(50, doc.y)
                   .lineTo(doc.page.width - 50, doc.y)
                   .stroke();
                doc.moveDown();
              }
            } catch (imgError) {
              console.error(`Error processing image ${imageUrl}: ${imgError.message}`);
              doc.font('Helvetica').fontSize(10).text(`Could not load image: ${path.basename(imageUrl)}`, { color: 'red' });
              doc.moveDown();
            }
          }
        } catch (imagesError) {
          console.error(`Error processing images section: ${imagesError.message}`);
          doc.font('Helvetica').fontSize(10).text('Error loading images', { color: 'red' });
        }
        
        doc.moveDown();
      }
      
      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        // Footer position
        const footerY = doc.page.height - 50;
        
        // Save current position
        const originalY = doc.y;
        
        // Move to footer position
        doc.y = footerY;
        
        // Add footer text
        doc.font('Helvetica').fontSize(8);
        doc.text('This is a computer-generated document and does not require a signature.', { align: 'center' });
        doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.text(`Page ${i + 1} of ${pageCount}`, { align: 'center' });
        
        // Restore position
        doc.y = originalY;
      }
      
      // Finalize PDF
      doc.end();
      
      // Handle events
      outStream.on('finish', () => {
        // Verify file was created successfully
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            console.log(`PDF generated successfully: ${outputPath} (${stats.size} bytes)`);
            resolve(outputPath);
          } else {
            reject(new Error('Generated PDF file is empty'));
          }
        } else {
          reject(new Error('Failed to create PDF file'));
        }
      });
      
      outStream.on('error', (error) => {
        console.error(`Error in outStream: ${error.message}`);
        reject(error);
      });
      
    } catch (error) {
      console.error(`Error in generateSimplePdf: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Original function, now implemented using our shared code
 * Generates a medical report PDF for a completed appointment
 * @param {Object} reportData - The data to be included in the report
 * @param {string} outputPath - The path where the PDF will be saved
 * @returns {Promise<string>} - The path to the generated PDF
 */
const generateMedicalReportPdf = async (reportData, outputPath = null) => {
  try {
    // If outputPath is not provided, create a temp file
    const timestamp = Date.now();
    const fileName = outputPath || path.join(__dirname, `../temp/report_${reportData._id || timestamp}.pdf`);
    
    // Ensure the directory exists
    const dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
    
    // Use the same implementation for both functions
    return await generateSimplePdf(reportData, fileName);
    
  } catch (error) {
    console.error('Error in generateMedicalReportPdf:', error);
    throw error;
  }
};

module.exports = {
  generateMedicalReportPdf,
  generateSimplePdf,
  generatePdf,
  ensureUploadsDir,
  downloadImage
}; 