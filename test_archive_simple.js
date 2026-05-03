const http = require('http');

function testArchiveEndpoint() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/files/archive?page=1&limit=5',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZGUzOTA2ZDE3NzM0ODUyZmMxZDhiNSIsImVtYWlsIjoiYWRtaW5AZG1zLmNvbSIsIm5hbWUiOiJTWVNURU0gQURNSU5JU1RSQVRPUiIsInJvbGUiOiJhZG1pbiIsImRlcGFydG1lbnQiOiJJVCIsInJlbWVtYmVyTWUiOnRydWUsImlhdCI6MTc3Njc1NTk0OSwiZXhwIjoxNzc3MzYwNzQ5fQ.ARhuI5o5zogKiazADl3xyap4WNMTovEwqGva97f-HEA',
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      try {
        const jsonData = JSON.parse(data);
        console.log('Response data:', JSON.stringify(jsonData, null, 2));
      } catch (e) {
        console.log('Response body:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    console.error('Error code:', e.code);
    console.error('Error errno:', e.errno);
  });

  req.end();
}

testArchiveEndpoint();