const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3000/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i.test(API_URL)) {
  throw new Error('This mutating test is restricted to a local/staging API. Production is read-only.');
}
if (!ADMIN_EMAIL || !ADMIN_PASS) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.');
}

async function main() {
  console.log('Logging in as admin...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  
  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status}): ${text}`);
  }
  
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in successfully. Token length:', token.length);

  // Clean up existing test resource to keep the URL same
  const slug = 'apresentacao-de-teste-google-slides';
  console.log(`Checking if resource with slug '${slug}' already exists...`);
  const checkRes = await fetch(`${API_URL}/resources/${slug}`);
  if (checkRes.ok) {
    const checkData = await checkRes.json();
    const existingId = checkData.resource?.id;
    if (existingId) {
      console.log(`Found existing resource (ID: ${existingId}). Deleting...`);
      const deleteRes = await fetch(`${API_URL}/resources/${existingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (deleteRes.ok) {
        console.log('Existing resource deleted successfully.');
      } else {
        console.warn('Failed to delete existing resource:', await deleteRes.text());
      }
    }
  } else {
    console.log('No existing test resource found.');
  }

  const pptxPath = path.join(__dirname, '..', 'test-slides.pptx');
  if (!fs.existsSync(pptxPath)) {
    throw new Error(`File not found: ${pptxPath}`);
  }

  console.log('Preparing multipart upload...');
  const formData = new FormData();
  formData.append('title', 'Apresentação de Teste (Google Slides)');
  formData.append('description', 'Este é um recurso de teste contendo slides de PowerPoint para verificar o visualizador.');
  formData.append('is_published', '1');
  formData.append('display_mode', 'default');
  formData.append('download_limit_max', '');
  formData.append('download_limit_period', '');
  formData.append('page_layout', '{}');
  
  // Set labels for files as a JSON string
  formData.append('file_labels', JSON.stringify(['Apresentação de Teste']));

  // Read file as blob
  const fileBuffer = fs.readFileSync(pptxPath);
  const fileBlob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  formData.append('files', fileBlob, 'test-slides.pptx');

  console.log('Sending request to create resource and upload file...');
  const uploadRes = await fetch(`${API_URL}/resources`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const responseText = await uploadRes.text();
  console.log(`Response Status: ${uploadRes.status}`);
  console.log('Response:', responseText);
  
  if (uploadRes.ok) {
    const data = JSON.parse(responseText);
    const resource = data.resource || data;
    console.log('\n==================================================');
    console.log('🎉 Resource uploaded successfully!');
    console.log(`Title: ${resource.title}`);
    console.log(`View live at: https://jewisheducationalresources.org/material/${resource.slug}`);
    console.log('==================================================');
  } else {
    console.error('Upload failed!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
