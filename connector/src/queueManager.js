/**
 * Quản lý hàng đợi hành động (Action Queue)
 * Đảm bảo các nhân vật 3D thực hiện động tác lần lượt, không bị chồng chéo animation
 */
class QueueManager {
    constructor(intervalMs = 3000) {
        this.intervalMs = intervalMs;
        this.queue = [];
        this.isProcessing = false;
        this.onDispatchAction = null;
        this.timer = null;
    }

    /**
     * Thêm hành động vào hàng đợi
     * @param {Object} item
     * item: {
     *   id,
     *   actionType: 'ACTION_INCENSE' | 'ACTION_BOW' | 'ACTION_LOTUS',
     *   priority: 1 (Lotus) | 2 (Bow) | 3 (Incense),
     *   user: { userId, nickname, avatar },
     *   gift: { name, count, coins },
     *   timestamp
     * }
     */
    enqueue(item) {
        item.id = item.id || `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        item.timestamp = item.timestamp || Date.now();

        // Chèn vào danh sách theo độ ưu tiên (priority nhỏ hơn là ưu tiên cao hơn)
        let inserted = false;
        for (let i = 0; i < this.queue.length; i++) {
            if (item.priority < this.queue[i].priority) {
                this.queue.splice(i, 0, item);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.queue.push(item);
        }

        if (!this.isProcessing) {
            this.startProcessing();
        }
    }

    startProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.processNext();
    }

    processNext() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        const currentItem = this.queue.shift();

        if (typeof this.onDispatchAction === 'function') {
            try {
                this.onDispatchAction(currentItem, this.queue.length);
            } catch (err) {
                console.error('[QueueManager] Lỗi khi dispatch hành động:', err);
            }
        }

        // Đợi hết thời gian animation rồi xử lý tiếp phần tử tiếp theo
        this.timer = setTimeout(() => {
            this.processNext();
        }, this.intervalMs);
    }

    getQueueLength() {
        return this.queue.length;
    }

    clear() {
        this.queue = [];
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.isProcessing = false;
    }
}

module.exports = QueueManager;
