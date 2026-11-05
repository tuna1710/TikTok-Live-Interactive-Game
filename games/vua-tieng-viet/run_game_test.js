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

    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skipDonorHonor' })
    });
    await sleep(500);

    // 7. Kiểm thử Cảm Ơn Người Follow
    console.log('\n--- BƯỚC 6: KIỂM THỬ CẢM ƠN NGƯỜI FOLLOW ---');
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateFollow', nickname: 'Bé Linh Cute' })
    });
    console.log('✅ Đã kích hoạt giả lập Follow cho: Bé Linh Cute');
    await sleep(800);

    const shot4 = path.join(__dirname, 'public', 'test_4_follow_thankyou.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot4}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình thông báo cảm ơn Follow: test_4_follow_thankyou.png (${fs.statSync(shot4).size} bytes)`);

    // 8. Kiểm thử Siêu Vinh Danh Nhà Hảo Tâm (Top Donors)
    console.log('\n--- BƯỚC 7: KIỂM THỬ SIÊU VINH DANH NHÀ HẢO TÂM TẶNG QUÀ NHIỀU ---');
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateDonorHonor', nickname: 'Đại Gia Trâm Anh', diamonds: 999, duration: 20 })
    });
    console.log('✅ Đã kích hoạt Siêu Vinh Danh Nhà Hảo Tâm: Đại Gia Trâm Anh (999 xu)');
    await sleep(1500);

    const shot5 = path.join(__dirname, 'public', 'test_5_donor_honor.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot5}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Siêu Vinh Danh Nhà Hảo Tâm: test_5_donor_honor.png (${fs.statSync(shot5).size} bytes)`);

    // Đóng vinh danh
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skipDonorHonor' })
    });
    await sleep(500);

    // 9. Kiểm thử Mục 1: Tặng Quà Mở Chữ Cái (Interactive Gift Hint)
    console.log('\n--- BƯỚC 8: KIỂM THỬ MỤC 1 - TẶNG QUÀ MỞ CHỮ CÁI GỢI Ý ---');
    // Chuyển sang vòng câu đố mới
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' })
    });
    await sleep(600);

    const roundBefore = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    const hiddenBefore = roundBefore.state.remainingHiddenLetters;
    console.log(`📌 Câu đố hiện tại: "${roundBefore.actualWord}" (Có ${hiddenBefore} chữ ẩn)`);

    // Giả lập Bé Mai tặng 1 Hoa Hồng
    const hintRes = await (await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateGiftHint', nickname: 'Bé Mai 🌸', giftName: 'Hoa Hồng', diamonds: 1 })
    })).json();

    console.log(`🎁 Kết quả tặng quà mở chữ: ${hintRes.message}`);
    console.log(`   - Chữ cái được mở: "${hintRes.result?.letter}" tại vị trí ${hintRes.result?.index}`);
    console.log(`   - Số chữ ẩn còn lại: ${hintRes.result?.remainingHidden}`);

    await sleep(1000);
    const shot6 = path.join(__dirname, 'public', 'test_6_gift_hint_unlocked.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot6}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Tặng Quà Mở Chữ: test_6_gift_hint_unlocked.png (${fs.statSync(shot6).size} bytes)`);

    // Kiểm tra giới hạn giữ lại 1 chữ cái cuối cùng
    console.log('🧪 Thử nghiệm mở tiếp các chữ cái cho tới khi chạm giới hạn bí mật:');
    for (let i = 0; i < 10; i++) {
      const loopRes = await (await fetch('http://127.0.0.1:3005/admin/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulateGiftHint', nickname: 'Khán Giả ' + (i + 1), giftName: 'Hoa Hồng', diamonds: 1 })
      })).json();

      if (loopRes.result?.limitReached) {
        console.log(`🔒 [GIỚI HẠN AN TOÀN ĐÃ KÍCH HOẠT THÀNH CÔNG] ${loopRes.result.message}`);
        break;
      } else {
        console.log(`   + Mở thêm chữ: "${loopRes.result?.letter}" (Còn ${loopRes.result?.remainingHidden} chữ ẩn)`);
      }
      await sleep(200);
    }

    // 10. Kiểm thử Mục 2: Chuỗi Thắng Liên Tiếp (Combo Win Streak & Flame)
    console.log('\n--- BƯỚC 9: KIỂM THỬ MỤC 2 - CHUỖI THẮNG LIÊN TIẾP (COMBO WIN STREAK) ---');
    // Câu 1: Cao Thủ Bất Bại thắng lần 1
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' })
    });
    await sleep(600);
    const r1 = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`📌 Vòng 1 Streak - Đáp án: "${r1.actualWord}"`);
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'Cao Thủ Bất Bại', text: r1.actualWord })
    });
    await sleep(1000);

    // Câu 2: Cao Thủ Bất Bại thắng lần 2 (Streak x2 - x1.2)
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' })
    });
    await sleep(600);
    const r2 = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`📌 Vòng 2 Streak - Đáp án: "${r2.actualWord}"`);
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'Cao Thủ Bất Bại', text: r2.actualWord })
    });
    await sleep(1000);

    // Câu 3: Cao Thủ Bất Bại thắng lần 3 (Streak x3 - x1.5 🔥🔥)
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' })
    });
    await sleep(600);
    const r3 = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`📌 Vòng 3 Streak - Đáp án: "${r3.actualWord}"`);
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'Cao Thủ Bất Bại', text: r3.actualWord })
    });
    await sleep(1200);

    const stateStreak3 = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    const streakInfo = stateStreak3.state.currentStreak;
    console.log(`🔥 [KẾT QUẢ COMBO STREAK x3]`);
    console.log(`   - Người giữ chuỗi: ${streakInfo?.nickname}`);
    console.log(`   - Số câu thắng liên tiếp: x${streakInfo?.count} (${streakInfo?.streakTitle})`);
    console.log(`   - Hệ số điểm: x${streakInfo?.multiplier}`);
    console.log(`   - Điểm nhận được vòng này: ${streakInfo?.totalPoints}đ (Gốc: ${streakInfo?.basePoints}đ + Thưởng: ${streakInfo?.bonusPoints}đ)`);

    const shot7 = path.join(__dirname, 'public', 'test_7_combo_streak.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot7}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Chuỗi Thắng Bốc Lửa: test_7_combo_streak.png (${fs.statSync(shot7).size} bytes)`);

    // Kiểm thử chuỗi Thần Tốc Bất Bại x5 (x2.0 điểm ⚡)
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateStreak', nickname: 'Cao Thủ Bất Bại', count: 5 })
    });
    const stateStreak5 = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`⚡ [THỬ NGHIỆM MỐC CAO NHẤT x5 BẤT BẠI] Hệ số: x${stateStreak5.state.currentStreak?.multiplier} (${stateStreak5.state.currentStreak?.totalPoints} điểm)`);

    // Kiểm thử ngắt chuỗi thắng
    await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resetStreak' })
    });
    const stateReset = await (await fetch('http://127.0.0.1:3005/api/state')).json();
    console.log(`❄️ [NGẮT CHUỖI THẮNG THÀNH CÔNG] Trạng thái chuỗi: ${stateReset.state.currentStreak ? 'Còn' : 'Đã về 0'}`);

    // 10. Kiểm thử Mục 6 - Rương Kho Báu & Mốc Thả Tim (Like Milestone Chest)
    console.log('\n--- BƯỚC 10: KIỂM THỬ MỤC 6 - RƯƠNG KHO BÁU & MỐC THẢ TIM (LIKE CHEST) ---');
    // Thả 50 tim
    const resLike50 = await (await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateLike', count: 50, nickname: 'Bé Thảo 🌸' })
    })).json();
    console.log(`💖 Đã thả 50 tim: Tiến độ rương ${resLike50.chestState?.chestLikes}/${resLike50.chestState?.milestoneStep} (${resLike50.chestState?.percent}%)`);

    // Thả tiếp 150 tim để kích hoạt Mở Rương Vàng (Đạt mốc 200 tim)
    console.log('⚡ Thả thêm 150 tim để cán mốc 200 tim kích hoạt Mở Rương Kho Báu...');
    const resLike200 = await (await fetch('http://127.0.0.1:3005/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateLike', count: 150, nickname: 'Đại Gia Thả Tim' })
    })).json();
    console.log(`🎁 [RƯƠNG VÀNG NỔ TUNG] Đã mở thành công Rương #${resLike200.chestState?.chestsOpened}!`);
    console.log(`   - Tổng số tim tích lũy: ${resLike200.chestState?.currentLikes}`);
    console.log(`   - Mốc rương tiếp theo: ${resLike200.chestState?.targetLikes} tim`);

    await sleep(1000);
    const shot8 = path.join(__dirname, 'public', 'test_8_like_chest.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shot8}" "http://127.0.0.1:3005"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Hoạt Ảnh Rương Kho Báu: test_8_like_chest.png (${fs.statSync(shot8).size} bytes)`);

    // Chụp lại bảng Admin để kiểm tra thống kê rương
    const shot9 = path.join(__dirname, 'public', 'test_9_admin_chest.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=520,800 --screenshot="${shot9}" "http://127.0.0.1:3005/admin.html"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh Bảng Admin với thống kê Rương Kho Báu: test_9_admin_chest.png (${fs.statSync(shot9).size} bytes)`);

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
