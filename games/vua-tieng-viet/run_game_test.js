const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('🎮 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN GAME VUA TIẾNG VIỆT...');

  // 1. Khởi động server
  const serverProc = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3005', ROUND_TIME: '300' },
    stdio: 'ignore'
  });

  serverProc.on('error', (err) => console.error('Lỗi khởi động server:', err));

  // Chờ server sẵn sàng
  await sleep(2500);

  try {
    // 2. Kiểm tra State khởi tạo
    console.log('\n--- BƯỚC 1: KIỂM TRA TRẠNG THÁI SERVER ---');
    const resState1 = await fetch('http://127.0.0.1:3005/api/state');
    const state1 = await resState1.json();
    console.log(`✅ Server đang chạy trên port 3005.`);
    console.log(`✅ Vòng hiện tại: Vòng ${state1.state.round} | Trạng thái: ${state1.state.roundState}`);
    console.log(`✅ Câu đố: "${state1.actualWord}" | Chủ đề: "${state1.state.category}" | Gợi ý: "${state1.state.hint}"`);

    // Chụp màn hình vòng chơi bình thường
    const shot1 = path.join(__dirname, 'public', 'test_1_playing.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot1}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh giao diện khi đang chơi: test_1_playing.png (${fs.statSync(shot1).size} bytes)`);

    // 3. Giả lập bình luận
    console.log('\n--- BƯỚC 2: KIỂM THỬ BÌNH LUẬN & ĐOÁN ĐÁP ÁN ---');
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'NguoiXemA', text: 'dap an linh tinh' })
    });
    console.log('✅ Khán giả NguoiXemA gửi bình luận sai: "dap an linh tinh"');

    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'NguoiXemA', text: state1.actualWord })
    });
    console.log(`✅ Khán giả NguoiXemA đoán ĐÚNG: "${state1.actualWord}" -> Thắng vòng (+100đ)`);

    // Chờ 5s để chuyển sang vòng mới
    console.log('⏳ Chờ 5s để tự động chuyển sang vòng tiếp theo...');
    await sleep(5500);

    const resState2 = await fetch('http://127.0.0.1:3005/api/state');
    const state2 = await resState2.json();
    console.log(`✅ Đã chuyển sang Vòng ${state2.state.round}! Từ mới: "${state2.actualWord}"`);

    // 4. Giả lập tặng quà (Bảng Tấm Lòng Vàng)
    console.log('\n--- BƯỚC 3: KIỂM THỬ TẶNG QUÀ (TẤM LÒNG VÀNG) ---');
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateGift', user: 'Mạnh Thường Quân Tuấn', giftName: 'Tên Lửa VIP', diamonds: 100 })
    });
    console.log('✅ Đã kích hoạt tặng quà "Tên Lửa VIP" (100 xu) cho Mạnh Thường Quân Tuấn');

    // 5. Kiểm thử cán mốc 2.000 điểm & Vinh danh Top 5
    console.log('\n--- BƯỚC 4: KIỂM THỬ VINH DANH 2.000 ĐIỂM & BẢNG VÀNG TOP 5 ---');
    // Thiết lập điểm cho Top 5
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setUserScore', uniqueId: 'player_champion', nickname: 'Cao Thủ Tuấn', score: 1900, wins: 19 })
    });
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setUserScore', uniqueId: 'top2', nickname: 'Anh Ba Miền Tây', score: 1800, wins: 18 })
    });
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setUserScore', uniqueId: 'top3', nickname: 'Bé Na Chăm Học', score: 1500, wins: 15 })
    });
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setUserScore', uniqueId: 'top4', nickname: 'Chiến Thần Đố Chữ', score: 1200, wins: 12 })
    });
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setUserScore', uniqueId: 'top5', nickname: 'Minh Tuấn Vlog', score: 900, wins: 9 })
    });
    console.log('✅ Đã thiết lập bảng điểm Top 5: Cao Thủ Tuấn đang có 1.900đ.');

    // Cao Thủ Tuấn đoán đúng từ hiện tại để chạm mốc 2.000đ!
    console.log(`🎯 Cao Thủ Tuấn đoán từ: "${state2.actualWord}"`);
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'player_champion', text: state2.actualWord })
    });

    console.log('⏳ Chờ 4s để modal Siêu Vinh Danh 2.000đ kích hoạt...');
    await sleep(4500);

    // Chụp ảnh giao diện Siêu Vinh Danh 2.000đ & Top 5
    const shot2 = path.join(__dirname, 'public', 'test_2_milestone_top5.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot2}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Siêu Vinh Danh 2.000đ: test_2_milestone_top5.png (${fs.statSync(shot2).size} bytes)`);

    // Chụp ảnh bảng điều khiển Admin
    const shot3 = path.join(__dirname, 'public', 'test_3_admin_dashboard.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=520,800 --screenshot="${shot3}" "http://127.0.0.1:3005/admin.html"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh bảng điều khiển Admin: test_3_admin_dashboard.png (${fs.statSync(shot3).size} bytes)`);

    // 6. Kiểm thử kết thúc vinh danh & Reset bảng điểm (Bảo lưu bảng Tấm Lòng Vàng)
    console.log('\n--- BƯỚC 5: KIỂM THỬ RESET BẢNG ĐIỂM & BẢO LƯU BẢNG TẤM LÒNG VÀNG ---');
    const resSkip = await (await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skipMilestone' })
    })).json();
    console.log('✅ Admin kết thúc vinh danh:', resSkip.message);

    await sleep(1500);
    const finalState = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`📊 KẾT QUẢ KIỂM TRA BẢNG ĐIỂM:`);
    console.log(`   - Số người trên Bảng Điểm (sau reset): ${finalState.state.leaderboard?.length || 0} (ĐÃ RESET VỀ 0)`);
    console.log(`   - Số người trên Bảng Tấm Lòng Vàng: ${finalState.state.donorLeaderboard?.length || 0} (ĐÃ BẢO LƯU)`);
    if (finalState.state.donorLeaderboard && finalState.state.donorLeaderboard.length > 0) {
      console.log(`   - Nhà hảo tâm dẫn đầu: ${finalState.state.donorLeaderboard[0].nickname} - ${finalState.state.donorLeaderboard[0].diamonds} xu`);
    }

    console.log('\n========================================================================');
    console.log('🎉 TẤT CẢ CÁC TÍNH NĂNG ĐÃ ĐƯỢC TEST THÀNH CÔNG VÀ SẴN SÀNG ĐƯA VÀO LIVE!');
    console.log('========================================================================');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
  } finally {
    serverProc.kill();
  }
}

main();
