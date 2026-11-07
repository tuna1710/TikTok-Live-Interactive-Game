const { spawn } = require('child_process');
const path = require('path');
const io = require('socket.io-client');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
  console.log('🧪 [TEST] Bắt đầu kiểm thử tính năng Bảng Vinh Danh Tặng Quà TikTok...');

  const TEST_PORT = 3010;
  const serverProc = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(TEST_PORT), ROUND_TIME: '300' },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', (d) => {
    // console.log('[Server stdout]', d.toString().trim());
  });
  serverProc.stderr.on('data', (d) => {
    console.error('[Server stderr]', d.toString().trim());
  });

  await sleep(2500);

  const receivedEvents = [];

  try {
    // 1. Kiểm tra /api/state
    const stateRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/state`);
    const stateJson = await stateRes.json();
    if (!stateJson.ok) throw new Error('API /api/state không trả về ok');
    console.log('✅ [TEST 1] Server khởi động thành công trên cổng ' + TEST_PORT);

    // 2. Kết nối Socket.io client
    const socket = io(`http://127.0.0.1:${TEST_PORT}`, {
      transports: ['websocket'],
      forceNew: true
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket.io kết nối timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ [TEST 2] Socket.io client kết nối thành công, ID:', socket.id);
        resolve();
      });
    });

    socket.on('giftHonorNotification', (data) => {
      receivedEvents.push({ event: 'giftHonorNotification', data });
    });
    socket.on('donorUpdate', (data) => {
      receivedEvents.push({ event: 'donorUpdate', data });
    });

    // 3. Test quà thường 1 xu có Avatar
    console.log('\n--- TEST 3: Giả lập tặng 1 bông Hoa Hồng (1 xu) có avatar ---');
    const customAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100';
    const gift1Res = await (await fetch(`http://127.0.0.1:${TEST_PORT}/admin/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'simulateGift',
        user: 'Bé Mai 🌸',
        giftName: 'Hoa Hồng',
        diamonds: 1,
        repeatCount: 1,
        avatar: customAvatar
      })
    })).json();

    console.log('   Kết quả API simulateGift 1:', gift1Res.message);
    await sleep(600);

    const honorEvent1 = receivedEvents.find(e => e.event === 'giftHonorNotification' && e.data.donor.nickname === 'Bé Mai 🌸');
    if (!honorEvent1) throw new Error('Không nhận được event giftHonorNotification cho Bé Mai 🌸');
    if (honorEvent1.data.donor.avatar !== customAvatar) throw new Error('Avatar không khớp!');
    if (honorEvent1.data.diamonds !== 1) throw new Error('Số xu không khớp!');
    if (!honorEvent1.data.ttsText || !honorEvent1.data.ttsText.includes('Bé Mai 🌸')) throw new Error('ttsText không hợp lệ!');
    console.log('✅ [TEST 3 PASS] Nhận được event giftHonorNotification với avatar đầy đủ:');
    console.log(`   - Người tặng: ${honorEvent1.data.donor.nickname}`);
    console.log(`   - Avatar: ${honorEvent1.data.donor.avatar}`);
    console.log(`   - Quà: ${honorEvent1.data.giftName} (${honorEvent1.data.diamonds} xu)`);
    console.log(`   - Hạng: #${honorEvent1.data.donorRank}`);
    console.log(`   - TTS: "${honorEvent1.data.ttsText}"`);

    // 4. Test quà Combo 10x Nước Hoa (100 xu)
    console.log('\n--- TEST 4: Giả lập Combo 10x Nước Hoa (10 xu x 10 = 100 xu) ---');
    const gift2Res = await (await fetch(`http://127.0.0.1:${TEST_PORT}/admin/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'simulateGift',
        user: 'Đại Gia Sài Gòn 🚀',
        giftName: 'Nước Hoa',
        diamonds: 10,
        repeatCount: 10
      })
    })).json();

    console.log('   Kết quả API simulateGift 2:', gift2Res.message);
    await sleep(600);

    const honorEvent2 = receivedEvents.find(e => e.event === 'giftHonorNotification' && e.data.donor.nickname === 'Đại Gia Sài Gòn 🚀');
    if (!honorEvent2) throw new Error('Không nhận được event giftHonorNotification cho Đại Gia Sài Gòn 🚀');
    if (honorEvent2.data.diamonds !== 100) throw new Error(`Số xu phải là 100 nhưng nhận ${honorEvent2.data.diamonds}`);
    if (honorEvent2.data.donorRank !== 1) throw new Error(`Đại Gia Sài Gòn phải là Top 1 nhưng nhận ${honorEvent2.data.donorRank}`);
    console.log('✅ [TEST 4 PASS] Nhận được Combo Gift Honor Event chính xác:');
    console.log(`   - Người tặng: ${honorEvent2.data.donor.nickname}`);
    console.log(`   - Quà: ${honorEvent2.data.repeatCount}x ${honorEvent2.data.giftName} (Tổng ${honorEvent2.data.diamonds} xu)`);
    console.log(`   - Thứ hạng mới: #${honorEvent2.data.donorRank}`);

    socket.disconnect();
    console.log('\n🎉 TẤT CẢ CÁC BÀI TEST KIỂM THỬ TÍNH NĂNG BẢNG VINH DANH QUÀ TIKTOK ĐỀU ĐẠT 100%!');
  } finally {
    serverProc.kill('SIGINT');
  }
}

runTest().catch((err) => {
  console.error('❌ [TEST FAILED]', err);
  process.exit(1);
});
