const axios = require('axios');

async function testArchiveEndpoint() {
  try {
    const response = await axios.get('http://localhost:5000/api/v1/files/archive?page=1&limit=5', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZGUzOTA2ZDE3NzM0ODUyZmMxZDhiNSIsImVtYWlsIjoiYWRtaW5AZG1zLmNvbSIsIm5hbWUiOiJTWVNURU0gQURNSU5JU1RSQVRPUiIsInJvbGUiOiJhZG1pbiIsImRlcGFydG1lbnQiOiJJVCIsInJlbWVtYmVyTWUiOnRydWUsImlhdCI6MTc3Njc1NTk0OSwiZXhwIjoxNzc3MzYwNzQ5fQ.ARhuI5o5zogKiazADl3xyap4WNMTovEwqGva97f-HEA',
        'Content-Type': 'application/json'
      }
    });

    console.log('Archive endpoint test successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Archive endpoint test failed:');
    console.log('Error:', error.response ? error.response.data : error.message);
  }
}

testArchiveEndpoint();