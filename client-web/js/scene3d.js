/**
 * Scene3D - Quản lý không gian Chánh điện 3D bằng Three.js
 * Bao gồm: Tượng Phật dát vàng, Hào quang xoay, Lư hương khói trầm,
 * Nhân vật áo lam dâng hương & lạy Phật, hiệu ứng Hoa sen nở rộ.
 */
class Scene3D {
    constructor(containerId, audioManager) {
        this.container = document.getElementById(containerId);
        this.audio = audioManager;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Đối tượng 3D chính
        this.buddhaGroup = null;
        this.haloRing = null;
        this.incenseBurner = null;
        this.smokeParticles = [];
        this.lightBeam = null;
        this.character = null;
        this.lotusBurstGroup = null;

        // Trạng thái animation
        this.isAnimatingAction = false;
        this.clock = new THREE.Clock();

        this.init();
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // Khởi tạo Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x120703); // Tông màu chùa cổ trầm ấm
        this.scene.fog = new THREE.FogExp2(0x180b06, 0.04);

        // Khởi tạo Camera góc nhìn toàn cảnh chánh điện chuẩn 9:16
        this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
        this.camera.position.set(0, 2.8, 8.5);
        this.camera.lookAt(0, 2.4, 0);

        // Khởi tạo Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        this.setupLights();
        this.buildTempleEnvironment();
        this.buildBuddhaAltar();
        this.buildSittingDevotees();
        this.createSmokeSystem();

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    setupLights() {
        // Ánh sáng môi trường vàng dịu
        const ambient = new THREE.AmbientLight(0xffdfa8, 0.7);
        this.scene.add(ambient);

        // Ánh hào quang từ tượng Phật tỏa xuống
        const buddhaLight = new THREE.PointLight(0xffd700, 2.2, 14);
        buddhaLight.position.set(0, 5.0, 0.5);
        this.scene.add(buddhaLight);

        // Đèn nến hai bên bàn thờ
        const candleLeft = new THREE.PointLight(0xff5500, 1.2, 5);
        candleLeft.position.set(-1.6, 2.2, 1.2);
        this.scene.add(candleLeft);

        const candleRight = new THREE.PointLight(0xff5500, 1.2, 5);
        candleRight.position.set(1.6, 2.2, 1.2);
        this.scene.add(candleRight);

        // Đèn rọi chánh điện
        const spot = new THREE.SpotLight(0xffeedd, 2.0);
        spot.position.set(0, 8, 5);
        spot.target.position.set(0, 3.5, 0);
        spot.angle = Math.PI / 5;
        spot.penumbra = 0.5;
        spot.castShadow = true;
        this.scene.add(spot);
        this.scene.add(spot.target);
    }

    buildTempleEnvironment() {
        // Sàn đá bóng màu sẫm
        const floorGeo = new THREE.PlaneGeometry(20, 30);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x1a0f0a,
            roughness: 0.35,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Thảm hoa văn đỏ trải giữa chánh điện
        const carpetGeo = new THREE.PlaneGeometry(2.4, 20);
        const carpetMat = new THREE.MeshStandardMaterial({
            color: 0x7c1410,
            roughness: 0.8
        });
        const carpet = new THREE.Mesh(carpetGeo, carpetMat);
        carpet.rotation.x = -Math.PI / 2;
        carpet.position.set(0, 0.01, 2);
        carpet.receiveShadow = true;
        this.scene.add(carpet);

        // Đường viền vàng cho thảm đỏ
        const borderGeo = new THREE.PlaneGeometry(2.5, 20);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.rotation.x = -Math.PI / 2;
        border.position.set(0, 0.005, 2);
        this.scene.add(border);

        // Bốn cột gỗ sơn son thếp vàng hai bên
        const colMat = new THREE.MeshStandardMaterial({ color: 0x3d170a, roughness: 0.5 });
        const goldBandMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });

        [-2.8, 2.8].forEach(x => {
            [0, 4, 8].forEach(z => {
                const colGeo = new THREE.CylinderGeometry(0.28, 0.32, 12, 16);
                const column = new THREE.Mesh(colGeo, colMat);
                column.position.set(x, 6, z);
                column.castShadow = true;
                this.scene.add(column);

                const bandGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 16);
                const band = new THREE.Mesh(bandGeo, goldBandMat);
                band.position.set(x, 2.5, z);
                this.scene.add(band);
            });
        });

        // Bồ đoàn (đệm ngồi nhung đỏ) xếp hai bên theo phối cảnh chánh điện
        [
            { x: -0.88, z: 2.2 }, { x: 0.88, z: 2.2 },
            { x: -0.85, z: 3.6 }, { x: 0.85, z: 3.6 },
            { x: -0.82, z: 5.0 }, { x: 0.82, z: 5.0 },
            { x: -0.80, z: 6.4 }, { x: 0.80, z: 6.4 }
        ].forEach(pt => {
            const cushion = new THREE.Mesh(cushionGeo, cushionMat);
            cushion.position.set(pt.x, 0.08, pt.z);
            cushion.receiveShadow = true;
            this.scene.add(cushion);
        });

        // Bồ đoàn chính giữa chánh điện để phật tử dâng hương & quỳ lạy
        [1.6, 2.8].forEach(z => {
            const cushion = new THREE.Mesh(cushionGeo, centerCushionMat);
            cushion.position.set(0, 0.08, z);
            cushion.receiveShadow = true;
            this.scene.add(cushion);
        });
    }

    buildBuddhaAltar() {
        this.buddhaGroup = new THREE.Group();

        // Bàn thờ tam cấp gỗ gụ sơn thếp vàng
        const altarBaseGeo = new THREE.BoxGeometry(4.8, 1.2, 2.0);
        const altarMat = new THREE.MeshStandardMaterial({ color: 0x301108, roughness: 0.4 });
        const altarBase = new THREE.Mesh(altarBaseGeo, altarMat);
        altarBase.position.set(0, 0.6, -0.2);
        altarBase.castShadow = true;
        altarBase.receiveShadow = true;
        this.scene.add(altarBase);

        // Tầng 2 bàn thờ
        const altarTopGeo = new THREE.BoxGeometry(3.6, 0.6, 1.5);
        const altarTop = new THREE.Mesh(altarTopGeo, altarMat);
        altarTop.position.set(0, 1.5, -0.3);
        altarTop.castShadow = true;
        this.scene.add(altarTop);

        // Đài Sen Vàng (Lotus Pedestal)
        const pedestalGroup = new THREE.Group();
        const baseCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.4, 0.4, 24),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.25 })
        );
        baseCyl.position.y = 1.9;
        pedestalGroup.add(baseCyl);

        // Cánh sen nở tỏa đều
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const petalGeo = new THREE.ConeGeometry(0.25, 0.6, 5);
            const petalMat = new THREE.MeshStandardMaterial({
                color: 0xffcc33,
                metalness: 0.85,
                roughness: 0.2
            });
            const petal = new THREE.Mesh(petalGeo, petalMat);
            petal.position.set(Math.cos(angle) * 1.15, 2.15, Math.sin(angle) * 1.15 - 0.3);
            petal.rotation.z = Math.PI;
            petal.rotation.y = angle;
            petal.rotation.x = 0.3;
            pedestalGroup.add(petal);
        }
        this.scene.add(pedestalGroup);

        // Tượng Phật Thích Ca dát vàng (Phong thái thiền định)
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xffd23f,
            metalness: 0.9,
            roughness: 0.18,
            envMapIntensity: 1.5
        });

        // Thân tượng tọa thiền
        const bodyGeo = new THREE.CylinderGeometry(0.75, 1.15, 1.5, 16);
        const body = new THREE.Mesh(bodyGeo, goldMat);
        body.position.set(0, 2.85, -0.3);
        body.castShadow = true;
        this.buddhaGroup.add(body);

        // Đầu tượng Phật
        const headGeo = new THREE.SphereGeometry(0.48, 20, 20);
        const head = new THREE.Mesh(headGeo, goldMat);
        head.position.set(0, 3.9, -0.3);
        head.castShadow = true;
        this.buddhaGroup.add(head);

        // Nhục kế (Ushnisha) trên đỉnh đầu
        const ushnishaGeo = new THREE.ConeGeometry(0.18, 0.35, 12);
        const ushnisha = new THREE.Mesh(ushnishaGeo, goldMat);
        ushnisha.position.set(0, 4.4, -0.3);
        this.buddhaGroup.add(ushnisha);

        // Vòng Hào Quang xoay quanh đầu tượng Phật
        const haloGroup = new THREE.Group();
        const haloRingGeo = new THREE.TorusGeometry(1.3, 0.08, 16, 48);
        const haloMat = new THREE.MeshStandardMaterial({
            color: 0xffec99,
            emissive: 0xffaa00,
            emissiveIntensity: 0.8,
            metalness: 0.9,
            roughness: 0.1
        });
        this.haloRing = new THREE.Mesh(haloRingGeo, haloMat);
        haloGroup.add(this.haloRing);

        // Tia sáng hào quang phía sau
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const rayGeo = new THREE.CylinderGeometry(0.015, 0.04, 1.6, 6);
            const rayMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.65 });
            const ray = new THREE.Mesh(rayGeo, rayMat);
            ray.position.set(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, -0.05);
            ray.rotation.z = angle - Math.PI / 2;
            haloGroup.add(ray);
        }

        haloGroup.position.set(0, 4.0, -0.5);
        this.buddhaGroup.add(haloGroup);
        this.scene.add(this.buddhaGroup);

        // Lư hương đồng (Bronze Incense Burner)
        this.buildIncenseBurner();
    }

    buildIncenseBurner() {
        const burnerGroup = new THREE.Group();
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0xc8963e,
            metalness: 0.85,
            roughness: 0.3
        });

        // Thân lư hương
        const potGeo = new THREE.CylinderGeometry(0.38, 0.28, 0.45, 16);
        const pot = new THREE.Mesh(potGeo, bronzeMat);
        pot.position.y = 0.22;
        pot.castShadow = true;
        burnerGroup.add(pot);

        // 3 chân vạc của lư hương
        for (let i = 0; i < 3; i++) {
            const legGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.18, 8);
            const leg = new THREE.Mesh(legGeo, bronzeMat);
            const ang = (i / 3) * Math.PI * 2;
            leg.position.set(Math.cos(ang) * 0.25, 0.07, Math.sin(ang) * 0.25);
            burnerGroup.add(leg);
        }

        // Tàn tro và que nhang đỏ
        const ashGeo = new THREE.CircleGeometry(0.35, 16);
        const ashMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
        const ash = new THREE.Mesh(ashGeo, ashMat);
        ash.rotation.x = -Math.PI / 2;
        ash.position.y = 0.45;
        burnerGroup.add(ash);

        // 3 nén hương đang cháy đỏ đầu
        for (let i = -1; i <= 1; i++) {
            const stickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
            const stickMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
            const stick = new THREE.Mesh(stickGeo, stickMat);
            stick.position.set(i * 0.08, 0.65, 0);
            burnerGroup.add(stick);

            // Đầu nhang phát sáng đỏ
            const tipGeo = new THREE.SphereGeometry(0.02, 8, 8);
            const tipMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
            const tip = new THREE.Mesh(tipGeo, tipMat);
            tip.position.set(i * 0.08, 0.9, 0);
            burnerGroup.add(tip);
        }

        burnerGroup.position.set(0, 1.2, 0.55);
        this.incenseBurner = burnerGroup;
        this.scene.add(burnerGroup);

        // Cột sáng linh thiêng khi dâng hương (ẩn ban đầu)
        const beamGeo = new THREE.CylinderGeometry(0.25, 0.08, 4.2, 16);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xfff2a8,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        });
        this.lightBeam = new THREE.Mesh(beamGeo, beamMat);
        this.lightBeam.position.set(0, 3.2, 0.55);
        this.scene.add(this.lightBeam);
    }

    createSmokeSystem() {
        const particleCount = 45;
        const geo = new THREE.SphereGeometry(0.06, 6, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.35
        });

        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.set(
                (Math.random() - 0.5) * 0.15,
                1.9 + Math.random() * 2.2,
                0.55 + (Math.random() - 0.5) * 0.15
            );
            p.scale.setScalar(0.8 + Math.random() * 1.5);
            p.userData = {
                speedY: 0.008 + Math.random() * 0.012,
                driftX: (Math.random() - 0.5) * 0.006,
                initialY: 1.9
            };
            this.smokeParticles.push(p);
            this.scene.add(p);
        }
    }

    buildSittingDevotees() {
        this.devotees = [];
        this.tagsContainer = document.getElementById('devotees-tags-container');
        if (this.tagsContainer) this.tagsContainer.innerHTML = '';

        // Danh sách các Phật tử ngồi quỳ trong chánh điện theo đúng clip gốc
        const devoteesData = [
            { id: 'dev-0', name: 'Chang0307', initial: 'C', color: '#27ae60', pos: [0, 0.08, 2.8], isMain: true, robeColor: 0x758594 },
            { id: 'dev-1', name: 'hanwa', initial: 'H', color: '#2980b9', pos: [0, 0.08, 1.6], isMain: false, robeColor: 0x687b8c },
            { id: 'dev-2', name: 'Phạm văn anh', initial: 'P', color: '#e67e22', pos: [-0.88, 0.08, 2.2], isMain: false, robeColor: 0x5a3d2e },
            { id: 'dev-3', name: 'Hoàng Vũ', initial: 'H', color: '#8e44ad', pos: [0.88, 0.08, 2.2], isMain: false, robeColor: 0x6c7c8c },
            { id: 'dev-4', name: 'Chi Phèo', initial: 'C', color: '#d35400', pos: [-0.85, 0.08, 3.6], isMain: false, subtext: 'luôn r..', robeColor: 0x4a5568 },
            { id: 'dev-5', name: 'Trang', initial: 'T', color: '#16a085', pos: [0.85, 0.08, 3.6], isMain: false, subtext: ':))', robeColor: 0x758594 },
            { id: 'dev-6', name: 'Văn Nhiêu', initial: 'V', color: '#2ecc71', pos: [-0.82, 0.08, 5.0], isMain: false, subtext: 'A men', robeColor: 0x5a3d2e },
            { id: 'dev-7', name: 'bum bum', initial: 'B', color: '#e74c3c', pos: [0.82, 0.08, 5.0], isMain: false, robeColor: 0x687b8c }
        ];

        devoteesData.forEach((data) => {
            const devoteeObj = this.createSingleDevotee(data);
            this.devotees.push(devoteeObj);
            this.scene.add(devoteeObj.mesh);

            if (data.isMain) {
                this.character = devoteeObj.mesh;
                this.mainDevotee = devoteeObj;
            }
        });
    }

    createSingleDevotee(data) {
        const group = new THREE.Group();
        group.position.set(data.pos[0], data.pos[1], data.pos[2]);

        const robeMat = new THREE.MeshStandardMaterial({ color: data.robeColor || 0x758594, roughness: 0.7 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7, roughness: 0.6 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

        // Đùi / vạt áo lam xếp bằng quỳ trên bồ đoàn
        const lapGeo = new THREE.BoxGeometry(0.52, 0.22, 0.48);
        const lap = new THREE.Mesh(lapGeo, robeMat);
        lap.position.set(0, 0.11, 0);
        lap.castShadow = true;
        group.add(lap);

        // Thân áo lam ngồi ngay ngắn
        const torsoGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.62, 12);
        const torso = new THREE.Mesh(torsoGeo, robeMat);
        torso.position.set(0, 0.48, -0.02);
        torso.castShadow = true;
        group.add(torso);

        // Đầu & khuôn mặt
        const headGeo = new THREE.SphereGeometry(0.16, 14, 14);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.set(0, 0.92, -0.02);
        head.castShadow = true;
        group.add(head);

        // Tóc đen búi gọn
        const hairGeo = new THREE.SphereGeometry(0.17, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.set(0, 0.94, -0.02);
        group.add(hair);

        // Hai tay chắp trang nghiêm trước ngực (Anjali Mudra)
        const handsGroup = new THREE.Group();
        const handGeo = new THREE.BoxGeometry(0.06, 0.14, 0.04);
        const leftHand = new THREE.Mesh(handGeo, skinMat);
        leftHand.position.set(-0.025, 0, 0.12);
        leftHand.rotation.y = 0.2;

        const rightHand = new THREE.Mesh(handGeo, skinMat);
        rightHand.position.set(0.025, 0, 0.12);
        rightHand.rotation.y = -0.2;

        handsGroup.add(leftHand);
        handsGroup.add(rightHand);
        handsGroup.position.set(0, 0.52, -0.02);
        group.add(handsGroup);

        // Điểm neo nhãn tên 3D (3D Tag Anchor)
        const anchor = new THREE.Object3D();
        anchor.position.set(0, 1.22, 0);
        group.add(anchor);

        // Tạo phần tử DOM nhãn tên nổi
        let tagEl = null;
        let badgeTextEl = null;
        let avatarEl = null;

        if (this.tagsContainer) {
            tagEl = document.createElement('div');
            tagEl.className = 'sitting-devotee-badge-wrapper';
            tagEl.id = `devotee-tag-${data.id}`;
            tagEl.innerHTML = `
                <div class="sitting-devotee-badge">
                    <span class="avatar-badge" style="background-color: ${data.color}">${data.initial}</span>
                    <span class="badge-text">${data.name}</span>
                </div>
                ${data.subtext ? `<div class="devotee-mini-bubble">${data.subtext}</div>` : ''}
            `;
            this.tagsContainer.appendChild(tagEl);
            badgeTextEl = tagEl.querySelector('.badge-text');
            avatarEl = tagEl.querySelector('.avatar-badge');
        }

        return {
            id: data.id,
            mesh: group,
            torso,
            anchor,
            tagEl,
            badgeTextEl,
            avatarEl,
            data
        };
    }

    /**
     * Hành động 1: Dâng hương (1 Coin - Hoa hồng)
     */
    triggerIncenseAction(userName, onComplete) {
        if (this.isAnimatingAction) return;
        this.isAnimatingAction = true;

        if (this.audio) this.audio.playBell();

        if (this.mainDevotee) {
            if (userName) {
                if (this.mainDevotee.badgeTextEl) this.mainDevotee.badgeTextEl.innerText = userName;
                if (this.mainDevotee.avatarEl) this.mainDevotee.avatarEl.innerText = userName[0].toUpperCase();
            }
            const badgeEl = this.mainDevotee.tagEl ? this.mainDevotee.tagEl.querySelector('.sitting-devotee-badge') : null;
            if (badgeEl) badgeEl.classList.add('active-offering');
        }

        const startZ = 2.8;
        const targetZ = 1.25;
        let progress = 0;

        // Giai đoạn 1: Phật tử chính đứng dậy tiến lên trước bát hương
        const walkForward = () => {
            progress += 0.035;
            this.character.position.z = startZ + (targetZ - startZ) * Math.sin(progress * Math.PI / 2);
            this.character.position.y = 0.08 + Math.sin(progress * Math.PI * 4) * 0.04; // Nhấp nhô bước đi

            if (progress < 1) {
                requestAnimationFrame(walkForward);
            } else {
                // Giai đoạn 2: Cắm hương & Bừng sáng cột sáng linh thiêng
                this.flashLightBeam();
                setTimeout(() => {
                    walkBack();
                }, 1400);
            }
        };

        // Giai đoạn 3: Lùi lại vị trí bồ đoàn
        let backProgress = 0;
        const walkBack = () => {
            backProgress += 0.035;
            this.character.position.z = targetZ + (startZ - targetZ) * Math.sin(backProgress * Math.PI / 2);
            this.character.position.y = 0.08 + Math.sin(backProgress * Math.PI * 4) * 0.04;

            if (backProgress < 1) {
                requestAnimationFrame(walkBack);
            } else {
                this.character.position.set(0, 0.08, startZ);
                const badgeEl = this.mainDevotee.tagEl ? this.mainDevotee.tagEl.querySelector('.sitting-devotee-badge') : null;
                if (badgeEl) badgeEl.classList.remove('active-offering');
                this.isAnimatingAction = false;
                if (onComplete) onComplete();
            }
        };

        walkForward();
    }

    flashLightBeam() {
        let alpha = 0;
        let brightening = true;
        const animateBeam = () => {
            if (brightening) {
                alpha += 0.08;
                if (alpha >= 0.85) brightening = false;
            } else {
                alpha -= 0.04;
            }
            this.lightBeam.material.opacity = Math.max(0, alpha);
            this.lightBeam.rotation.y += 0.05;

            if (alpha > 0) {
                requestAnimationFrame(animateBeam);
            } else {
                this.lightBeam.material.opacity = 0;
            }
        };
        animateBeam();
    }

    /**
     * Hành động 2: Lễ Phật - Cả đạo tràng đồng loạt quỳ lạy ba lạy (5 Coins)
     */
    triggerBowAction(userName, onComplete) {
        if (this.isAnimatingAction) return;
        this.isAnimatingAction = true;

        if (this.audio) this.audio.playBell();

        if (this.mainDevotee && userName) {
            if (this.mainDevotee.badgeTextEl) this.mainDevotee.badgeTextEl.innerText = userName;
            if (this.mainDevotee.avatarEl) this.mainDevotee.avatarEl.innerText = userName[0].toUpperCase();
        }

        let bowsCount = 0;
        let step = 0;

        const doSingleBow = () => {
            step += 0.05;
            const angle = Math.sin(step) * 0.85; // Góc cúi gập lạy Phật
            
            // Tất cả các phật tử đồng loạt cúi lạy trang nghiêm
            if (this.devotees) {
                this.devotees.forEach(dev => {
                    if (dev.mesh) dev.mesh.rotation.x = Math.max(0, angle);
                });
            }

            if (step < Math.PI) {
                requestAnimationFrame(doSingleBow);
            } else {
                bowsCount++;
                step = 0;
                if (this.devotees) {
                    this.devotees.forEach(dev => {
                        if (dev.mesh) dev.mesh.rotation.x = 0;
                    });
                }
                if (this.audio) this.audio.playWoodenFish();

                if (bowsCount < 3) {
                    setTimeout(doSingleBow, 250);
                } else {
                    this.isAnimatingAction = false;
                    if (onComplete) onComplete();
                }
            }
        };

        doSingleBow();
    }

    /**
     * Hành động 3: Dâng Hoa Sen Nở Rộ (10+ Coins)
     */
    triggerLotusAction(userName, onComplete) {
        if (this.isAnimatingAction) return;
        this.isAnimatingAction = true;

        if (this.audio) {
            this.audio.playBell();
            setTimeout(() => this.audio.playBell(), 400);
        }

        // Tạo chùm hoa sen vàng nở bay lên trước tượng Phật
        const lotus = new THREE.Group();
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const petal = new THREE.Mesh(
                new THREE.ConeGeometry(0.2, 0.6, 5),
                new THREE.MeshStandardMaterial({
                    color: 0xff3388,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.6,
                    metalness: 0.8
                })
            );
            petal.position.set(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4);
            petal.rotation.z = Math.PI * 0.8;
            petal.rotation.y = angle;
            lotus.add(petal);
        }
        lotus.position.set(0, 1.8, 1.2);
        lotus.scale.set(0.1, 0.1, 0.1);
        this.scene.add(lotus);

        let progress = 0;
        const animateLotus = () => {
            progress += 0.02;
            lotus.position.y = 1.8 + progress * 2.2;
            lotus.rotation.y += 0.06;
            const s = Math.sin(progress * Math.PI) * 1.5;
            lotus.scale.set(s, s, s);

            if (progress < 1) {
                requestAnimationFrame(animateLotus);
            } else {
                this.scene.remove(lotus);
                this.isAnimatingAction = false;
                if (onComplete) onComplete();
            }
        };

        animateLotus();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Xoay nhẹ hào quang Phật
        if (this.haloRing) {
            this.haloRing.rotation.z += 0.008;
        }

        // Cập nhật khói trầm hương bay cuộn tự nhiên
        this.smokeParticles.forEach(p => {
            p.position.y += p.userData.speedY;
            p.position.x += p.userData.driftX;
            p.scale.addScalar(0.003);
            p.material.opacity -= 0.0018;

            if (p.position.y > 4.5 || p.material.opacity <= 0) {
                p.position.y = p.userData.initialY;
                p.position.x = (Math.random() - 0.5) * 0.15;
                p.scale.setScalar(0.8);
                p.material.opacity = 0.35;
            }
        });

        // Chiếu tọa độ 3D của các Phật tử thành tọa độ 2D cho nhãn tên nổi
        if (this.devotees && this.devotees.length > 0 && this.container) {
            const widthHalf = this.container.clientWidth / 2;
            const heightHalf = this.container.clientHeight / 2;
            const tempV = new THREE.Vector3();

            this.devotees.forEach(dev => {
                if (!dev.tagEl || !dev.anchor) return;
                dev.anchor.getWorldPosition(tempV);
                tempV.project(this.camera);

                // Kiểm tra xem vị trí có nằm trước camera không
                if (tempV.z < 1) {
                    const x = (tempV.x * widthHalf) + widthHalf;
                    const y = -(tempV.y * heightHalf) + heightHalf;
                    dev.tagEl.style.left = `${x}px`;
                    dev.tagEl.style.top = `${y}px`;
                    dev.tagEl.style.display = 'flex';
                } else {
                    dev.tagEl.style.display = 'none';
                }
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}

window.Scene3D = Scene3D;
