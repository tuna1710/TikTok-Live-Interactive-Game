const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TÍNH NĂNG MỚI: GÓI CÂU HỎI & BÌNH CHỌN CHỦ ĐỀ 500Đ...');

  // 1. Khởi động server test trên port 3006
  const serverProc = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3006', ROUND_TIME: '300' },
    stdio: 'ignore'
  });

  serverProc.on('error', (err) => console.error('Lỗi server:', err));
  await sleep(2500);

  try {
    // TEST 1: Kiểm tra Gói câu hỏi (Question Packs)
    console.log('\n--- TEST 1: CHỌN VÀ ĐỔI GÓI CÂU HỎI (QUESTION PACKS) ---');
    const state0 = await (await fetch('http://127.0.0.1:3006/api/state')).json();
    console.log(`📦 Gói hiện tại ban đầu: ${state0.state.currentPackName} (ID: ${state0.state.currentPackId})`);

    // Đổi và kiểm tra lần lượt cả 5 gói Ngày 1 -> Ngày 5
    const packsToTest = ['day_1', 'day_2', 'day_3', 'day_4', 'day_5'];
    for (const pId of packsToTest) {
      const pRes = await (await fetch('http://127.0.0.1:3006/admin/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'selectPack', packId: pId })
      })).json();

      console.log(`✅ Kết quả đổi sang "${pId}": ${pRes.packName}`);
      console.log(`   - Tổng số câu trong gói: ${pRes.totalWords} câu | Còn lại trong deck: ${pRes.remainingInDeck} câu`);

      const sPack = await (await fetch('http://127.0.0.1:3006/api/state')).json();
      if (sPack.state.currentPackId !== pId || sPack.state.remainingInDeck !== 300) {
        throw new Error(`Đổi gói ${pId} thất bại: currentPackId=${sPack.state.currentPackId}, deck=${sPack.state.remainingInDeck}`);
      }
    }
    console.log('🎯 [PASS] Cả 5 Gói Ngày 1, 2, 3, 4, 5 đều được nạp và hoạt động chính xác (300 câu/gói)!');

    // Đổi lại gói đặc biệt
    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'selectPack', packId: 'special' })
    });
    console.log('✅ Đã đổi lại Gói Đặc Biệt thành công.');

    // TEST 2: Kích hoạt Bình chọn chủ đề (Topic Voting)
    console.log('\n--- TEST 2: KÍCH HOẠT BÌNH CHỌN CHỦ ĐỀ KHÁN GIẢ ---');
    const voteTriggerRes = await (await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'triggerTopicVote' })
    })).json();
    console.log('✅ Kích hoạt bình chọn:', voteTriggerRes.message);

    await sleep(600);
    const stateVote = await (await fetch('http://127.0.0.1:3006/api/state')).json();
    console.log(`📊 Trạng thái vòng chơi: ${stateVote.state.roundState}`);
    console.log(`   - Các lựa chọn bình chọn:`);
    stateVote.state.topicVoteState?.options?.forEach(opt => {
      console.log(`     [Phím ${opt.id}] Chủ đề: "${opt.name}" - Phiếu: ${opt.votes} (${opt.percent}%)`);
    });

    // Chụp ảnh giao diện đang trong trạng thái bình chọn chủ đề
    const shotVote = path.join(__dirname, 'public', 'test_topic_voting.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shotVote}" "http://127.0.0.1:3006"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Vòng Bình Chọn: test_topic_voting.png (${fs.statSync(shotVote).size} bytes)`);

    // TEST 3: Giả lập khán giả bình luận vote (1, 2, 3)
    console.log('\n--- TEST 3: KHÁN GIẢ BÌNH LUẬN BÌNH CHỌN CHỦ ĐỀ ---');
    const chosenOption = stateVote.state.topicVoteState.options[1]; // Lựa chọn 2
    console.log(`👉 Giả lập 3 khán giả vote cho Lựa chọn 2 ("${chosenOption.name}"):`);

    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'KhanGia_1', text: '2' })
    });
    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'KhanGia_2', text: 'chọn 2 nè' })
    });
    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'KhanGia_3', text: '2' })
    });

    // 1 khán giả vote cho lựa chọn 1
    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'KhanGia_4', text: '1' })
    });

    // Kiểm tra kết quả vote cập nhật
    const stateVoteUpdated = await (await fetch('http://127.0.0.1:3006/api/state')).json();
    console.log(`📊 Kết quả vote tức thời:`);
    stateVoteUpdated.state.topicVoteState?.options?.forEach(opt => {
      console.log(`     [Phím ${opt.id}] "${opt.name}": ${opt.votes} phiếu (${opt.percent}%)`);
    });

    // Chờ đếm ngược kết thúc bình chọn (tối đa 12s + 3.5s chuyển vòng)
    console.log('⏳ Đang chờ thời gian bình chọn kết thúc và chuyển sang Câu Hỏi Đặc Biệt 500đ...');
    const timeLeft = stateVoteUpdated.state.topicVoteState.timeLeft || 10;
    await sleep((timeLeft + 4.5) * 1000);

    // TEST 4: Kiểm tra Câu Đố Đặc Biệt 500đ
    console.log('\n--- TEST 4: KIỂM TRA CÂU ĐỐ ĐẶC BIỆT 500Đ ĐƯỢC KÍCH HOẠT ---');
    const stateSpecial = await (await fetch('http://127.0.0.1:3006/api/state')).json();
    console.log(`🎯 Vòng hiện tại: Vòng ${stateSpecial.state.round}`);
    console.log(`   - Trạng thái isSpecial500: ${stateSpecial.state.isSpecial500}`);
    console.log(`   - Phần thưởng pointsReward: ${stateSpecial.state.pointsReward} điểm`);
    console.log(`   - Chủ đề: "${stateSpecial.state.category}" (Khớp với chủ đề thắng bình chọn: "${chosenOption.name}")`);
    console.log(`   - Từ khóa cần đoán: "${stateSpecial.actualWord}"`);

    if (stateSpecial.state.isSpecial500 && stateSpecial.state.pointsReward === 500) {
      console.log('🎯 [PASS] Đã kích hoạt chính xác Vòng Đặc Biệt 500đ!');
    } else {
      throw new Error(`Kích hoạt vòng 500đ thất bại: isSpecial500=${stateSpecial.state.isSpecial500}, points=${stateSpecial.state.pointsReward}`);
    }

    // Chụp ảnh giao diện Câu hỏi đặc biệt 500đ
    const shotSpecial = path.join(__dirname, 'public', 'test_special_500.png');
    execSync(`timeout 10 google-chrome --headless --no-sandbox --disable-gpu --window-size=480,854 --screenshot="${shotSpecial}" "http://127.0.0.1:3006"`, { stdio: 'ignore' });
    console.log(`📸 Đã chụp ảnh màn hình Câu Đố Đặc Biệt 500đ: test_special_500.png (${fs.statSync(shotSpecial).size} bytes)`);

    // TEST 5: Khán giả đoán đúng câu 500đ
    console.log('\n--- TEST 5: ĐOÁN ĐÚNG CÂU 500Đ & CỘNG THƯỞNG ĐIỂM SỐ ---');
    await fetch('http://127.0.0.1:3006/admin/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simulateChat', user: 'NguoiChoiXuatSac', text: stateSpecial.actualWord })
    });

    await sleep(1500);
    const stateWinner = await (await fetch('http://127.0.0.1:3006/api/state')).json();
    const lastWinner = stateWinner.state.lastWinner;
    console.log(`🏆 Người chiến thắng: ${lastWinner?.nickname}`);
    console.log(`   - Điểm số nhận được: +${lastWinner?.points} điểm`);

    const playerInBoard = stateWinner.state.leaderboard?.find(p => p.nickname === 'NguoiChoiXuatSac');
    console.log(`   - Tổng điểm trên Bảng Xếp Hạng: ${playerInBoard?.score} điểm`);

    if (lastWinner?.points === 500 && playerInBoard?.score === 500) {
      console.log('🎯 [PASS] Điểm thưởng +500đ đã được trao chính xác cho người đoán đúng!');
    } else {
      throw new Error(`Điểm thưởng không chính xác: points=${lastWinner?.points}, score=${playerInBoard?.score}`);
    }

    console.log('\n========================================================================');
    console.log('🎉 TẤT CẢ CÁC BƯỚC TEST TÍNH NĂNG MỚI ĐÃ HOÀN TOÀN THÀNH CÔNG VÀ CHÍNH XÁC!');
    console.log('========================================================================');

  } catch (err) {
    console.error('❌ Kiểm thử thất bại:', err);
    process.exitCode = 1;
  } finally {
    serverProc.kill();
  }
}

runTests();
