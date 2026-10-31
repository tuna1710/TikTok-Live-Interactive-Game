using System.Collections;
using UnityEngine;
using TMPro;

namespace ChuaOnline.Interactive
{
    /// <summary>
    /// Điều phối hoạt cảnh 3D, âm thanh chuông mõ và UI hiển thị trong Unity
    /// </summary>
    public class TempleGameManager : MonoBehaviour
    {
        [Header("Character & Animator")]
        [SerializeField] private Animator characterAnimator;
        [SerializeField] private Transform characterTransform;
        [SerializeField] private Vector3 defaultPosition = new Vector3(0, 0, 2.8f);
        [SerializeField] private Vector3 altarPosition = new Vector3(0, 0, 1.25f);

        [Header("VFX & Particles")]
        [SerializeField] private ParticleSystem incenseSmoke;
        [SerializeField] private GameObject sacredLightBeam;
        [SerializeField] private ParticleSystem lotusBurstParticles;
        [SerializeField] private Transform buddhaHaloRing;

        [Header("Audio Sources")]
        [SerializeField] private AudioSource bellAudioSource;
        [SerializeField] private AudioSource woodenFishAudioSource;

        [Header("UI Elements (TextMeshPro)")]
        [SerializeField] private TextMeshProUGUI speechBubbleText;
        [SerializeField] private GameObject speechBubbleContainer;
        [SerializeField] private TextMeshProUGUI tickerAlertText;
        [SerializeField] private TextMeshProUGUI chantsSubtitleText;

        private Coroutine _bubbleCoroutine;

        private void Start()
        {
            if (characterTransform != null)
            {
                characterTransform.position = defaultPosition;
            }
            if (sacredLightBeam != null)
            {
                sacredLightBeam.SetActive(false);
            }
            if (speechBubbleContainer != null)
            {
                speechBubbleContainer.SetActive(false);
            }
        }

        private void Update()
        {
            // Xoay vòng hào quang Phật đều đặn
            if (buddhaHaloRing != null)
            {
                buddhaHaloRing.Rotate(Vector3.forward * (15f * Time.deltaTime));
            }
        }

        /// <summary>
        /// Kích hoạt hành động Dâng hương (1 Coin)
        /// </summary>
        public void OnOfferIncense(string nickname)
        {
            PlayBell();
            ShowBubble(nickname, "Dâng hương cầu an 🙏");
            StartCoroutine(IncenseSequenceCoroutine());
        }

        private IEnumerator IncenseSequenceCoroutine()
        {
            if (characterAnimator != null) characterAnimator.SetTrigger("WalkForward");

            // Di chuyển lên bàn thờ
            float elapsed = 0;
            float duration = 1.0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                characterTransform.position = Vector3.Lerp(defaultPosition, altarPosition, elapsed / duration);
                yield return null;
            }

            // Cắm hương & Bừng sáng cột sáng
            if (characterAnimator != null) characterAnimator.SetTrigger("OfferIncense");
            if (sacredLightBeam != null) sacredLightBeam.SetActive(true);

            yield return new WaitForSeconds(1.5f);

            if (sacredLightBeam != null) sacredLightBeam.SetActive(false);
            if (characterAnimator != null) characterAnimator.SetTrigger("WalkBack");

            // Lùi về bồ đoàn
            elapsed = 0;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                characterTransform.position = Vector3.Lerp(altarPosition, defaultPosition, elapsed / duration);
                yield return null;
            }

            if (characterAnimator != null) characterAnimator.SetTrigger("Idle");
        }

        /// <summary>
        /// Kích hoạt hành động Lễ Phật quỳ lạy (5 Coins)
        /// </summary>
        public void OnProstrate(string nickname)
        {
            PlayBell();
            ShowBubble(nickname, "Thành tâm Lễ Phật 🙏");
            if (characterAnimator != null)
            {
                characterAnimator.SetTrigger("Prostrate");
            }
            StartCoroutine(WoodenFishRhythmCoroutine(3));
        }

        private IEnumerator WoodenFishRhythmCoroutine(int times)
        {
            for (int i = 0; i < times; i++)
            {
                yield return new WaitForSeconds(0.8f);
                PlayWoodenFish();
            }
        }

        /// <summary>
        /// Kích hoạt hành động Dâng Hoa Sen Nở Rộ (10+ Coins)
        /// </summary>
        public void OnOfferLotus(string nickname)
        {
            PlayBell();
            ShowBubble(nickname, "Dâng đóa sen vàng cúng dường 🪷");
            if (lotusBurstParticles != null)
            {
                lotusBurstParticles.Play();
            }
        }

        /// <summary>
        /// Hiển thị bình luận của người xem
        /// </summary>
        public void OnNewComment(string nickname, string comment)
        {
            ShowBubble(nickname, comment);
        }

        private void ShowBubble(string nickname, string content)
        {
            if (speechBubbleText != null && speechBubbleContainer != null)
            {
                speechBubbleText.text = $"<b>{nickname}:</b> {content}";
                speechBubbleContainer.SetActive(true);

                if (_bubbleCoroutine != null) StopCoroutine(_bubbleCoroutine);
                _bubbleCoroutine = StartCoroutine(HideBubbleAfterDelay(3.5f));
            }
        }

        private IEnumerator HideBubbleAfterDelay(float delay)
        {
            yield return new WaitForSeconds(delay);
            if (speechBubbleContainer != null)
            {
                speechBubbleContainer.SetActive(false);
            }
        }

        public void PlayBell()
        {
            if (bellAudioSource != null) bellAudioSource.Play();
        }

        public void PlayWoodenFish()
        {
            if (woodenFishAudioSource != null) woodenFishAudioSource.Play();
        }
    }
}
