async function fetchUserInfoMultipleTimes() {
    const apiUrl = 'https://api.parroto.app/api/user/info';
    
    const token = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjJmMjk1MGEyNGFlYWRkMjYzYzIxM2I2MDNhZjMxNWEzMjdiNmM3MjAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc2hhZG93LWRpY3RhdGlvbiIsImF1ZCI6InNoYWRvdy1kaWN0YXRpb24iLCJhdXRoX3RpbWUiOjE3ODIzNjE3ODMsInVzZXJfaWQiOiJLTk9LRDdrUzBYU2d3M0RyUHN6cTlWeEZ6dkYzIiwic3ViIjoiS05PS0Q3a1MwWFNndzNEclBzenE5VnhGenZGMyIsImlhdCI6MTc4MjM2MTc4MywiZXhwIjoxNzgyMzY1MzgzLCJlbWFpbCI6InJvYm90MzE3NUBtcmlzY2FubmVyLmxpdmUiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJyb2JvdDMxNzVAbXJpc2Nhbm5lci5saXZlIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.XAbBpEC9t5bmKIhCh68-l6Irzhjaoh7y1YbQnrsONR5IoWgOMeCrV8LzptJ15Yi7mdY2AMoqsdiutFjNjr6WsrRYlGftHDjPDPuQp9mPZHZYUxuGnqes59aeK25QRH7gIJgMwH7Lb8RR8Rx8Icqsxs2lOytFmrcc_ycrxFCgqS8CMf3XNFS56t8rTT52AzRhlNFELDV7ViucLH_9jx3e9oHPKgLkrd3O-M4nNWs8QBZyhZ1uQpKsI4CL8k01kzxQ3jhSC9RXBljj7I3KQyYGn9Bpu1WX9FeoiVJuVyHo3fqhWfNA6gx3lhLIQt9by1_r8zQZw2ZdanR95U8pzkpJsA'; 

    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
        }
    };

    try {
        console.log('Đang gửi 10 requests cùng lúc (Bỏ qua nếu có lỗi)...');

        const requests = Array.from({ length: 100 }, async (_, index) => {
            try {
                const response = await fetch(apiUrl, options);
                
                if (!response.ok) {
                    console.log(`[Request ${index + 1}] Thất bại - HTTP ${response.status}`);
                    return null;
                }
                
                const data = await response.json();
                console.log(`[Request ${index + 1}] Thành công!`);
                return data;

            } catch (error) {
                console.log(`[Request ${index + 1}] Lỗi kết nối: ${error.message}`);
                return null; 
            }
        });

        const results = await Promise.all(requests);

        const successfulData = results.filter(item => item !== null);

        console.log('---');
        console.log(`✅ Hoàn tất! Số lượng request thành công: ${successfulData.length}/10`);
        if (successfulData.length > 0) {
            console.log('Dữ liệu trả về:', successfulData);
        }

    } catch (error) {
        console.error('❌ Lỗi hệ thống:', error);
    }
}

fetchUserInfoMultipleTimes();