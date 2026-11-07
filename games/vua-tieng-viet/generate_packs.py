import json
import random
from collections import defaultdict, Counter

def main():
    with open('data/words.json', 'r', encoding='utf-8') as f:
        words = json.load(f)

    with open('data/packs/day_1.json', 'r', encoding='utf-8') as f:
        day_1 = json.load(f)

    d1_words = set(w['word'].strip().upper() for w in day_1)
    print(f'Tổng số câu trong words.json: {len(words)}')
    print(f'Tổng số câu trong day_1.json: {len(day_1)}')

    # Lọc các từ không trùng với day_1
    available_words = [w for w in words if w['word'].strip().upper() not in d1_words]
    print(f'Số câu khả dụng để chia gói: {len(available_words)}')

    # Gom nhóm theo danh mục
    cat_groups = defaultdict(list)
    for w in available_words:
        cat_groups[w.get('category', 'Đời Sống')].append(w)

    random.seed(2026)
    for cat in cat_groups:
        random.shuffle(cat_groups[cat])

    # Chia cho 6 gói: day_2 đến day_7 (mỗi gói đúng 300 câu)
    pack_nums = [2, 3, 4, 5, 6, 7]
    target_packs = {p: [] for p in pack_nums}

    # Phân bổ tỷ lệ từng danh mục vào 6 gói
    for cat, items in cat_groups.items():
        quota = len(items) // len(pack_nums)
        if quota > 0:
            for idx, p in enumerate(pack_nums):
                start = idx * quota
                end = start + quota
                space_left = 300 - len(target_packs[p])
                if space_left > 0:
                    target_packs[p].extend(items[start:start+min(quota, space_left)])

    # Đưa các từ dư còn lại vào các gói chưa đủ 300 câu
    used_ids = set(w['id'] for p in target_packs.values() for w in p)
    leftover = [w for w in available_words if w['id'] not in used_ids]
    random.shuffle(leftover)

    for p in pack_nums:
        while len(target_packs[p]) < 300 and leftover:
            target_packs[p].append(leftover.pop())

    # Lưu từng gói vào thư mục data/packs/
    pack_titles = {
        2: '📅 Gói Ngày 2: Ẩm Thực 3 Miền & Quê Hương (300 câu)',
        3: '📅 Gói Ngày 3: Tục Ngữ Dân Gian & Thế Giới Tự Nhiên (300 câu)',
        4: '📅 Gói Ngày 4: Danh Lam Cổ Tích & Con Người Việt Nam (300 câu)',
        5: '📅 Gói Ngày 5: Hot Trend Gen Z & Đời Sống Mạng Xã Hội (300 câu)',
        6: '📅 Gói Ngày 6: Ca Dao Tục Ngữ & Trí Tuệ Dân Gian (300 câu)',
        7: '📅 Gói Ngày 7: Đố Vui Hài Hước & Trend Mạng Xã Hội (300 câu)'
    }

    all_assigned_ids = set()
    start_ids = {2: 2301, 3: 2601, 4: 2901, 5: 3201, 6: 3501, 7: 3801}
    for p in pack_nums:
        pack_list = target_packs[p]
        formatted_list = []
        cur_id = start_ids[p]
        for w in pack_list:
            item = dict(w)
            item['id'] = cur_id
            item['pack'] = f'day_{p}'
            formatted_list.append(item)
            all_assigned_ids.add(item['id'])
            cur_id += 1

        file_path = f'data/packs/day_{p}.json'
        with open(file_path, 'w', encoding='utf-8') as out_f:
            json.dump(formatted_list, out_f, ensure_ascii=False, indent=2)

        cats = Counter(w.get('category') for w in formatted_list)
        print(f"\n✅ Đã tạo {file_path}: {len(formatted_list)} câu ({len(cats)} danh mục)")
        print(f"   Top danh mục: {cats.most_common(5)}")

    print(f"\n🎉 Tổng số câu độc bản được chia thành công: {len(all_assigned_ids)} câu across day_2..day_7!")

if __name__ == '__main__':
    main()
