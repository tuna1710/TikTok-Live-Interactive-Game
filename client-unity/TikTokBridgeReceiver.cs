using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

#if !UNITY_WEBGL || UNITY_EDITOR
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
#endif

namespace ChuaOnline.Interactive
{
    [System.Serializable]
    public class UserData
    {
        public string userId;
        public string nickname;
        public string avatar;
    }

    [System.Serializable]
    public class GiftData
    {
        public string name;
        public int coins;
        public int repeatCount;
    }

    [System.Serializable]
    public class ActionPayload
    {
        public string id;
        public string actionType;
        public string actionLabel;
        public int priority;
        public UserData user;
        public GiftData gift;
        public string comment;
        public int remainingQueue;
    }

    [System.Serializable]
    public class SocketMessage
    {
        public string type;
        public string payload; // raw JSON string or deserialized
    }

    /// <summary>
    /// Nhận sự kiện thời gian thực từ Node.js TikTok Connector qua WebSocket
    /// </summary>
    public class TikTokBridgeReceiver : MonoBehaviour
    {
        [Header("WebSocket Configuration")]
        [SerializeField] private string serverUrl = "ws://localhost:8080";
        [SerializeField] private bool autoReconnect = true;
        [SerializeField] private float reconnectIntervalSeconds = 3f;

        [Header("References")]
        [SerializeField] private TempleGameManager gameManager;

#if !UNITY_WEBGL || UNITY_EDITOR
        private ClientWebSocket _webSocket;
        private CancellationTokenSource _cts;
#endif
        private readonly Queue<Action> _mainThreadQueue = new Queue<Action>();

        private void Start()
        {
            if (gameManager == null)
            {
                gameManager = FindObjectOfType<TempleGameManager>();
            }
            StartCoroutine(ConnectWebSocketCoroutine());
        }

        private IEnumerator ConnectWebSocketCoroutine()
        {
            yield return new WaitForSeconds(0.5f);
            Connect();
        }

        public async void Connect()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            try
            {
                _webSocket = new ClientWebSocket();
                _cts = new CancellationTokenSource();
                Uri uri = new Uri(serverUrl);

                Debug.Log($"[TikTokBridge] Đang kết nối tới {serverUrl}...");
                await _webSocket.ConnectAsync(uri, _cts.Token);
                Debug.Log("[TikTokBridge] Đã kết nối thành công tới Connector Bridge!");

                _ = ReceiveLoop();
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[TikTokBridge] Không thể kết nối tới server: {ex.Message}");
                if (autoReconnect)
                {
                    Invoke(nameof(Connect), reconnectIntervalSeconds);
                }
            }
#endif
        }

#if !UNITY_WEBGL || UNITY_EDITOR
        private async Task ReceiveLoop()
        {
            var buffer = new byte[1024 * 16];

            while (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                try
                {
                    var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                        break;
                    }

                    string json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    EnqueueMainThread(() => ProcessMessage(json));
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[TikTokBridge] Lỗi khi nhận dữ liệu: {ex.Message}");
                    break;
                }
            }

            if (autoReconnect)
            {
                EnqueueMainThread(() => Invoke(nameof(Connect), reconnectIntervalSeconds));
            }
        }
#endif

        private void ProcessMessage(string json)
        {
            try
            {
                if (json.Contains("\"ACTION_INCENSE\""))
                {
                    // 1 Coin: Dâng hương
                    gameManager?.OnOfferIncense(ExtractNickname(json));
                }
                else if (json.Contains("\"ACTION_BOW\""))
                {
                    // 5 Coins: Lễ Phật
                    gameManager?.OnProstrate(ExtractNickname(json));
                }
                else if (json.Contains("\"ACTION_LOTUS\""))
                {
                    // 10+ Coins: Dâng Hoa Sen
                    gameManager?.OnOfferLotus(ExtractNickname(json));
                }
                else if (json.Contains("\"CHAT_MESSAGE\""))
                {
                    // Bình luận
                    gameManager?.OnNewComment(ExtractNickname(json), ExtractComment(json));
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"[TikTokBridge] Lỗi xử lý JSON: {ex.Message}");
            }
        }

        private string ExtractNickname(string json)
        {
            int idx = json.IndexOf("\"nickname\":");
            if (idx == -1) return "Phật tử";
            int start = json.IndexOf("\"", idx + 11) + 1;
            int end = json.IndexOf("\"", start);
            return json.Substring(start, end - start);
        }

        private string ExtractComment(string json)
        {
            int idx = json.IndexOf("\"comment\":");
            if (idx == -1) return "Mô Phật";
            int start = json.IndexOf("\"", idx + 10) + 1;
            int end = json.IndexOf("\"", start);
            return json.Substring(start, end - start);
        }

        private void EnqueueMainThread(Action action)
        {
            lock (_mainThreadQueue)
            {
                _mainThreadQueue.Enqueue(action);
            }
        }

        private void Update()
        {
            lock (_mainThreadQueue)
            {
                while (_mainThreadQueue.Count > 0)
                {
                    _mainThreadQueue.Dequeue()?.Invoke();
                }
            }
        }

        private void OnDestroy()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            _cts?.Cancel();
            _webSocket?.Dispose();
#endif
        }
    }
}
