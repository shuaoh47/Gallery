// === GLOBAL APP CONSTANTS & VARIABLES ===
const clock = new THREE.Clock();

// Text stored in the gallery must never be interpreted as markup
function escapeHtml(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
}

// === PROCEDURAL BGM ENGINE ===
// Generates beautiful ambient music in the browser using Web Audio API on the fly
// Replaces static MP3 assets with zero-latency generative synthesis
const ProceduralBGM = {
    ctx: null,
    activePreset: null,
    masterGain: null,
    synths: [],
    crackleNode: null,
    intervalId: null,
    isPlaying: false,
    MUTED_KEY: 'gallery_bgm_muted',
    muted: true,

    // Music stays off until the viewer turns it on; that choice is remembered
    loadPreference() {
        try {
            this.muted = localStorage.getItem(this.MUTED_KEY) !== 'false';
        } catch (err) {
            this.muted = true;
        }
        this.syncButton();
    },

    toggleMuted() {
        this.muted = !this.muted;
        try {
            localStorage.setItem(this.MUTED_KEY, String(this.muted));
        } catch (err) {
            console.warn('Could not remember the music setting.', err);
        }
        
        if (this.ctx) {
            if (this.muted) this.ctx.suspend();
            else this.ctx.resume();
        }
        this.syncButton();
    },

    syncButton() {
        const button = document.getElementById('btn-bgm');
        button.innerText = this.muted ? '♪ OFF' : '♪ ON';
        button.setAttribute('aria-pressed', String(!this.muted));
    },

    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.ctx = new AudioContextClass();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        
        if (this.muted) this.ctx.suspend();
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
            this.ctx.resume();
        }
    },

    transitionTo(preset) {
        this.init();
        this.resume();
        
        if (this.activePreset === preset) return;
        
        const fadeTime = 1.0;
        const now = this.ctx.currentTime;
        
        // Fade out active synth
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0.001, now + fadeTime);
        }
        
        setTimeout(() => {
            this.stopAll();
            this.activePreset = preset;
            if (preset && preset !== 'none') {
                this.startPreset(preset);
                const fadeNow = this.ctx.currentTime;
                this.masterGain.gain.setValueAtTime(0.001, fadeNow);
                this.masterGain.gain.linearRampToValueAtTime(0.35, fadeNow + fadeTime);
            }
        }, fadeTime * 1000);
    },

    stopAll() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.crackleNode) {
            try { this.crackleNode.stop(); } catch(e){}
            this.crackleNode = null;
        }
        this.synths.forEach(s => {
            try { s.stop(); } catch(e){}
        });
        this.synths = [];
    },

    startPreset(preset) {
        this.stopAll();
        if (preset === 'ambient') {
            this.playAmbient();
        } else if (preset === 'lo-fi') {
            this.playLofi();
        } else if (preset === 'classic') {
            this.playClassic();
        }
    },

    // Lush pentatonic synthesizer pads
    playAmbient() {
        const notes = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00]; // C Major Pentatonic scale
        
        const triggerPad = () => {
            if (!this.ctx || this.ctx.state === 'suspended') return;
            const now = this.ctx.currentTime;
            
            // Play 3 random notes for a rich, floating wash
            for (let i = 0; i < 3; i++) {
                const freq = notes[Math.floor(Math.random() * notes.length)];
                
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                
                // Slow LFO pitch modulation
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.linearRampToValueAtTime(freq + (Math.random() - 0.5) * 2, now + 4);
                
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(450 + Math.random() * 150, now);
                
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.04, now + 2.0 + Math.random() * 0.5);
                gain.gain.setValueAtTime(0.04, now + 4.0);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 7.5);
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                
                osc.start(now);
                osc.stop(now + 8.0);
                
                this.synths.push(osc);
            }
        };
        
        triggerPad();
        this.intervalId = setInterval(triggerPad, 5000);
    },

    // Dusty Rhodes arpeggios + vinyl pops
    playLofi() {
        const now = this.ctx.currentTime;
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        // Generate filtered white noise crackle
        for (let i = 0; i < bufferSize; i++) {
            let crackle = (Math.random() - 0.5) * 0.012;
            if (Math.random() > 0.9997) {
                crackle += (Math.random() - 0.5) * 0.18; // rare pops
            }
            output[i] = crackle;
        }
        
        this.crackleNode = this.ctx.createBufferSource();
        this.crackleNode.buffer = noiseBuffer;
        this.crackleNode.loop = true;
        
        const crackleFilter = this.ctx.createBiquadFilter();
        crackleFilter.type = 'bandpass';
        crackleFilter.frequency.setValueAtTime(1200, now);
        crackleFilter.Q.setValueAtTime(0.4, now);
        
        const crackleGain = this.ctx.createGain();
        crackleGain.gain.setValueAtTime(0.06, now);
        
        this.crackleNode.connect(crackleFilter);
        crackleFilter.connect(crackleGain);
        crackleGain.connect(this.masterGain);
        this.crackleNode.start();
        
        // Lofi Jazz Chords
        const progressions = [
            [110.00, 130.81, 164.81, 196.00], // Am7 (A2, C3, E3, G3)
            [146.83, 174.61, 220.00, 261.63], // Dm7 (D3, F3, A3, C4)
            [97.99, 123.47, 146.83, 174.61],  // G7 (G2, B2, D3, F3)
            [130.81, 164.81, 196.00, 246.94]  // Cmaj7 (C3, E3, G3, B3)
        ];
        let progIdx = 0;
        
        const playChord = () => {
            if (!this.ctx || this.ctx.state === 'suspended') return;
            const tNow = this.ctx.currentTime;
            const chord = progressions[progIdx];
            progIdx = (progIdx + 1) % progressions.length;
            
            chord.forEach(freq => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, tNow);
                
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(280, tNow);
                
                gain.gain.setValueAtTime(0, tNow);
                gain.gain.linearRampToValueAtTime(0.08, tNow + 0.15);
                gain.gain.setValueAtTime(0.08, tNow + 1.8);
                gain.gain.exponentialRampToValueAtTime(0.001, tNow + 3.0);
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                
                osc.start(tNow);
                osc.stop(tNow + 3.2);
                
                this.synths.push(osc);
            });
        };
        
        playChord();
        this.intervalId = setInterval(playChord, 3500);
    },

    // Classical Harp arpeggiator
    playClassic() {
        const scale = [220.00, 261.63, 329.63, 440.00, 523.25, 659.25, 880.00]; // A Minor Arpeggio
        let idx = 0;
        let dir = 1;
        
        const playNote = () => {
            if (!this.ctx || this.ctx.state === 'suspended') return;
            const tNow = this.ctx.currentTime;
            
            const freq = scale[idx];
            idx += dir;
            if (idx >= scale.length - 1 || idx <= 0) dir *= -1;
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, tNow);
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, tNow);
            
            gain.gain.setValueAtTime(0, tNow);
            gain.gain.linearRampToValueAtTime(0.04, tNow + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, tNow + 1.1);
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            
            osc.start(tNow);
            osc.stop(tNow + 1.2);
            
            this.synths.push(osc);
        };
        
        playNote();
        this.intervalId = setInterval(playNote, 450);
    }
};

// Automatic resume of AudioContext upon user mouse clicks
document.addEventListener('click', () => {
    ProceduralBGM.resume();
});

// Helper to determine active room index based on camera depth coordinate
function getRoomStyle(works) {
    if (!works || works.length === 0) return 'default_gallery';
    
    // Count mediums to auto-detect style
    let sketchCount = 0;
    let cyberCount = 0;
    
    works.forEach(w => {
        const med = (w.medium || '').toLowerCase();
        if (med.includes('sketch') || med.includes('pencil') || med.includes('charcoal')) {
            sketchCount++;
        } else if (med.includes('3d') || med.includes('digital') || med.includes('neon') || med.includes('cyber')) {
            cyberCount++;
        }
    });

    if (sketchCount > cyberCount && sketchCount > 0) return 'sketch_studio';
    if (cyberCount > sketchCount && cyberCount > 0) return 'cyber_void';
    return 'default_gallery';
}

// Programmatic Canvas Tile Texture builder
function createTileTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'wood') {
        // Rich wood planks
        ctx.fillStyle = '#6e4726';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#5c3a1e';
        // Plank borders
        for (let i = 0; i < 256; i += 64) {
            ctx.fillRect(0, i, 256, 4);
        }
        // Wood grain lines
        ctx.strokeStyle = '#4a2e16';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            const y = Math.random() * 256;
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 20, 160, y + (Math.random() - 0.5) * 20, 256, y);
            ctx.stroke();
        }
        // Subtle highlighting
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            const y = Math.random() * 256;
            ctx.moveTo(0, y);
            ctx.lineTo(256, y + (Math.random() - 0.5) * 10);
            ctx.stroke();
        }
    } else if (type === 'paper') {
        // Off-white plaster/paper texture
        ctx.fillStyle = '#f5f3ef';
        ctx.fillRect(0, 0, 256, 256);
        const imgData = ctx.getImageData(0, 0, 256, 256);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 6;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
    } else if (type === 'concrete') {
        // Polished concrete tile
        ctx.fillStyle = '#2d3139';
        ctx.fillRect(0, 0, 256, 256);
        // Concrete noise
        const imgData = ctx.getImageData(0, 0, 256, 256);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 14;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 256, 256);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeRect(1, 1, 254, 254);
    } else if (type === 'cyber_grid') {
        // Cyberpunk grid
        ctx.fillStyle = '#05070f';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#c8b88a';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 256, 256);
        // Emissive cross lines
        ctx.beginPath();
        ctx.moveTo(128, 0); ctx.lineTo(128, 256);
        ctx.moveTo(0, 128); ctx.lineTo(256, 128);
        ctx.stroke();
        // Inner grid soft fill
        ctx.fillStyle = 'rgba(200, 184, 138, 0.02)';
        ctx.fillRect(4, 4, 248, 248);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
}

// === MAIN APP ENGINE OBJECT ===
const App = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    
    artworksInScene: [],
    floatingArtworks: [],
    exhibitionsList: [],
    activeRoomIndex: -1,
    
    hoveredArtwork: null,
    activeArtwork: null,
    
    // Curation parameters
    curationMode: false,
    selectedHelper: null,
    
    async init() {
        try {
            // Load database
            this.data = await Storage.load();
            
            // Set up Three.js components
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x060913);
            this.scene.fog = new THREE.FogExp2(0x060913, 0.015);
            
            this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 1.7, 10);
            
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            
            document.getElementById('canvas-container').appendChild(this.renderer.domElement);
            
            // Build custom controls
            this.setupControls();
            
            // Must run before the first room starts its music
            ProceduralBGM.loadPreference();
            
            // Populate/Render the gallery space
            this.reconstructGallery();
            
            // UI Init
            UI.init();
            
            // Window resizing
            window.addEventListener('resize', () => this.onResize());
            this.syncTopOffset();
            
            // Start render loop
            this.animate();
            
            // Owner sign-in (visitors stay in read-only mode)
            Auth.init();
            
            console.log("Virtual 3D Gallery Initialized.");
        } catch (err) {
            console.error("Failed to initialize 3D scene:", err);
        }
    },
    
    // Auto rooms recalculate positions on load, so a hand-placed work needs a manual room.
    // Every work in the room keeps the spot it has on screen right now.
    keepManualPlacement(work) {
        const roomName = work.exhibition || 'General Collection';
        const room = this.data.exhibitions.find(exh => exh.name === roomName);
        if (!room || room.layout_mode === 'manual') return;
        
        room.layout_mode = 'manual';
        this.artworksInScene.forEach(art => {
            const roommate = this.data.artworks.find(w => w.id === art.data.id);
            if (!roommate || roommate === work || (roommate.exhibition || 'General Collection') !== roomName) return;
            roommate.transform = {
                x: art.group.position.x,
                y: art.baseY,
                z: art.group.position.z,
                rotY: art.group.rotation.y
            };
        });
    },
    
    setupControls() {
        this.controls = new GalleryControls(this.camera, this.renderer.domElement);
    },
    
    // Removes an object and frees the GPU memory it holds
    removeAndDispose(object) {
        this.scene.remove(object);
        object.traverse(node => {
            if (node.geometry) node.geometry.dispose();
            const materials = [].concat(node.material || []);
            materials.forEach(material => {
                if (material.map) material.map.dispose();
                material.dispose();
            });
            if (node.isLight && node.dispose) node.dispose();
        });
    },
    
    // Group and rebuild all rooms and artworks
    reconstructGallery() {
        // Clean up previous scene objects
        this.artworksInScene.forEach(a => {
            this.removeAndDispose(a.group);
            if (a.light) this.removeAndDispose(a.light);
            if (a.backglow) this.removeAndDispose(a.backglow);
        });
        if (this.selectedHelper) {
            this.removeAndDispose(this.selectedHelper);
            this.selectedHelper = null;
        }
        
        // Remove room elements
        const toRemove = [];
        this.scene.traverse(node => {
            if (node.userData && (node.userData.isRoomGeo || node.userData.isParticleSystem || node.userData.isDoor)) {
                toRemove.push(node);
            }
        });
        toRemove.forEach(node => this.removeAndDispose(node));
        
        this.artworksInScene = [];
        this.floatingArtworks = [];
        this.exhibitionsList = [];
        
        // Gather and group artworks
        const grouped = {};
        this.data.artworks.forEach(work => {
            const exh = work.exhibition || 'General Collection';
            if (!grouped[exh]) grouped[exh] = [];
            grouped[exh].push(work);
        });
        
        // Verify all exhibitions in database exist, or spawn them
        this.data.exhibitions.forEach(exh => {
            if (!grouped[exh.name]) {
                grouped[exh.name] = []; // Empty room
            }
        });
        
        const exhNames = this.data.exhibitions.map(e => e.name);
        
        // Sort artworks within each exhibition chronologically
        exhNames.forEach(name => {
            if (grouped[name]) {
                grouped[name].sort((a, b) => new Date(a.date || '1970-01-01') - new Date(b.date || '1970-01-01'));
            } else {
                grouped[name] = [];
            }
        });
        
        this.numExhibitions = exhNames.length || 1;
        
        if (exhNames.length === 0) {
            this.createRoom('Empty Gallery', 0, [], 'default_gallery');
            UI.updateExhibitionInfo('Empty Gallery', 'No artworks present. Click "+ Add artwork" to populate your gallery.');
            return;
        }
        
        // Render rooms sequentially
        exhNames.forEach((exhName, index) => {
            const works = grouped[exhName];
            const exhConfig = this.data.exhibitions.find(e => e.name === exhName);
            const style = exhConfig ? exhConfig.style : getRoomStyle(works);
            
            this.createRoom(exhName, index, works, style);
            
            this.exhibitionsList.push({
                name: exhName,
                style: style,
                zCenter: -index * 30,
                worksCount: works.length
            });
        });
        
        // Update gallery title
        const galleryName = this.data.galleryName || '1116 Gallery';
        document.getElementById('gallery-title').innerText = galleryName;
        document.title = galleryName;
        
        // Trigger initial UI updates
        UI.syncSidebar();
        this.updateActiveRoomDetector(true);
    },
    
    // Renders a spatial zone representing an exhibition room
    createRoom(name, index, works, style) {
        const zCenter = -index * 30;
        const width = 20;
        const depth = 30;
        const height = 8;
        
        const hasNextRoom = index < this.numExhibitions - 1;
        const hasPrevRoom = index > 0;
        
        const exhConfig = this.data.exhibitions.find(e => e.name === name);
        const layoutMode = exhConfig ? (exhConfig.layout_mode || 'auto') : 'auto';
        
        // Textures
        let floorMat, wallMat, ceilMat;
        
        if (style === 'sketch_studio') {
            const woodTex = createTileTexture('wood');
            const plasterTex = createTileTexture('paper');
            
            floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.4 });
            wallMat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.9 });
            ceilMat = new THREE.MeshStandardMaterial({ color: 0xeeece8, roughness: 0.9 });
            
            // Cozy ambient lighting (brightened for visibility)
            const amb = new THREE.AmbientLight(0xfff5e6, 0.95);
            amb.userData = { isRoomGeo: true };
            this.scene.add(amb);
        } else if (style === 'cyber_void') {
            const cyberTex = createTileTexture('cyber_grid');
            
            floorMat = new THREE.MeshStandardMaterial({ map: cyberTex, roughness: 0.2, metalness: 0.8 });
            
            // Cyber void has no walls or ceilings! Just a dark infinite space
            // Let's add glowing stars/particles instead
            const particles = this.createCyberParticles(zCenter);
            particles.userData = { isRoomGeo: true, isParticleSystem: true };
            this.scene.add(particles);
            
            // Subtle ambient neon lighting (brightened for visibility)
            const pLight1 = new THREE.PointLight(0xfff0d0, 3.0, 30);
            pLight1.position.set(-8, 3.5, zCenter);
            pLight1.userData = { isRoomGeo: true };
            this.scene.add(pLight1);
            
            const pLight2 = new THREE.PointLight(0xffd9a0, 3.0, 30);
            pLight2.position.set(8, 3.5, zCenter);
            pLight2.userData = { isRoomGeo: true };
            this.scene.add(pLight2);
            
            // Soft fill ambient light for the void
            const amb = new THREE.AmbientLight(0x151b30, 0.5);
            amb.userData = { isRoomGeo: true };
            this.scene.add(amb);
        } else {
            const concreteTex = createTileTexture('concrete');
            const plasterTex = createTileTexture('paper');
            
            floorMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.6 });
            wallMat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.8 });
            ceilMat = new THREE.MeshStandardMaterial({ color: 0x111622, roughness: 0.9 });
            
            // Bright ambient lighting (brightened for visibility)
            const amb = new THREE.AmbientLight(0xffffff, 1.0);
            amb.userData = { isRoomGeo: true };
            this.scene.add(amb);
        }
        
        // Apply custom lighting configurations if present
        if (exhConfig && exhConfig.lights) {
            const customLight = exhConfig.lights;
            const lColor = new THREE.Color(customLight.color || '#ffffff');
            const lIntensity = customLight.intensity !== undefined ? parseFloat(customLight.intensity) : 1.0;
            
            if (customLight.type === 'ambient') {
                const ambOverride = new THREE.AmbientLight(lColor, lIntensity);
                ambOverride.userData = { isRoomGeo: true };
                this.scene.add(ambOverride);
            } else if (customLight.type === 'point') {
                const pt1 = new THREE.PointLight(lColor, lIntensity * 2.0, 25);
                pt1.position.set(-5, 4, zCenter - 5);
                pt1.userData = { isRoomGeo: true };
                this.scene.add(pt1);
                
                const pt2 = new THREE.PointLight(lColor, lIntensity * 2.0, 25);
                pt2.position.set(5, 4, zCenter + 5);
                pt2.userData = { isRoomGeo: true };
                this.scene.add(pt2);
            } else {
                // Spotlight layout
                const sp1 = new THREE.SpotLight(lColor, lIntensity * 3.0, 20, 0.6, 0.5, 1.0);
                sp1.position.set(0, 7.5, zCenter);
                sp1.target.position.set(0, 0, zCenter);
                sp1.userData = { isRoomGeo: true };
                this.scene.add(sp1);
                this.scene.add(sp1.target);
            }
        }
        
        // Create Floor plane
        const floorGeo = new THREE.PlaneGeometry(width, depth);
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, 0, zCenter);
        floorMesh.receiveShadow = true;
        floorMesh.userData = { isRoomGeo: true };
        this.scene.add(floorMesh);
        
        // Renders visual walls & ceiling if NOT cyber_void
        if (style !== 'cyber_void') {
            // Ceiling plane
            const ceilGeo = new THREE.PlaneGeometry(width, depth);
            const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
            ceilMesh.rotation.x = Math.PI / 2;
            ceilMesh.position.set(0, height, zCenter);
            ceilMesh.userData = { isRoomGeo: true };
            this.scene.add(ceilMesh);
            
            // Left Wall (X = -10)
            const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
            leftWall.position.set(-width/2, height/2, zCenter);
            leftWall.rotation.y = Math.PI / 2;
            leftWall.receiveShadow = true;
            leftWall.userData = { isRoomGeo: true };
            this.scene.add(leftWall);
            
            // Right Wall (X = 10)
            const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMat);
            rightWall.position.set(width/2, height/2, zCenter);
            rightWall.rotation.y = -Math.PI / 2;
            rightWall.receiveShadow = true;
            rightWall.userData = { isRoomGeo: true };
            this.scene.add(rightWall);
            
            // South Wall (Z = zCenter + 15) - Entry Wall
            if (!hasPrevRoom) {
                const southWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
                southWall.position.set(0, height/2, zCenter + depth/2);
                southWall.rotation.y = Math.PI;
                southWall.receiveShadow = true;
                southWall.userData = { isRoomGeo: true };
                this.scene.add(southWall);
            } else if (this.exhibitionsList[index - 1].style === 'cyber_void') {
                // A cyber void builds no walls, so this room closes the gap itself
                this.createPartitionWall(zCenter + depth/2, wallMat, width, height);
            }
            
            // North Wall (Z = zCenter - 15) - Partition Wall with Doorway
            const wallZ = zCenter - depth/2;
            if (!hasNextRoom) {
                // End wall is solid
                const northWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
                northWall.position.set(0, height/2, wallZ);
                northWall.receiveShadow = true;
                northWall.userData = { isRoomGeo: true };
                this.scene.add(northWall);
            } else {
                this.createPartitionWall(wallZ, wallMat, width, height);
            }
        }
        
        // Place artworks along walls (or floating)
        if (works && works.length > 0) {
            if (layoutMode === 'manual') {
                // Mode B: Manual Drag-and-Drop Curation Layout
                works.forEach(work => {
                    let pos, rotY, isFloating;
                    
                    if (work.transform) {
                        pos = new THREE.Vector3(work.transform.x, work.transform.y, work.transform.z);
                        rotY = work.transform.rotY;
                        isFloating = work.preset ? (work.preset.space_type === 'cyber_void') : (style === 'cyber_void');
                    } else {
                        // Populate default auto slot to initialize manual transformation
                        const wi = works.indexOf(work);
                        const isLeft = wi % 2 === 0;
                        const sideWorks = works.filter((w, i) => (i % 2 === 0) === isLeft);
                        const sideIdx = sideWorks.indexOf(work);
                        
                        const x = isLeft ? (style === 'cyber_void' ? -6 : -9.8) : (style === 'cyber_void' ? 6 : 9.8);
                        const y = (style === 'cyber_void') ? 2.5 : 2.2;
                        
                        let z = zCenter;
                        if (sideWorks.length > 1) {
                            const ratio = sideIdx / (sideWorks.length - 1);
                            z = zCenter + (ratio - 0.5) * 18;
                        }
                        
                        pos = new THREE.Vector3(x, y, z);
                        rotY = isLeft ? Math.PI / 2 : -Math.PI / 2;
                        isFloating = (style === 'cyber_void');
                        
                        // Seed transform coordinates
                        work.transform = { x: pos.x, y: pos.y, z: pos.z, rotY: rotY };
                    }
                    
                    this.addArtworkToScene(work, pos, rotY, isFloating, style, zCenter);
                });
            } else {
                // Mode A: Automatic Chronological Layout
                const leftWorks = [];
                const rightWorks = [];
                
                works.forEach((w, wi) => {
                    if (wi % 2 === 0) leftWorks.push(w);
                    else rightWorks.push(w);
                });
                
                const xLeft = (style === 'cyber_void') ? -6 : -9.8;
                const yOffset = (style === 'cyber_void') ? 2.5 : 2.2;
                const isFloating = (style === 'cyber_void');
                
                leftWorks.forEach((work, wIdx) => {
                    let zPos = zCenter;
                    if (leftWorks.length > 1) {
                        const ratio = wIdx / (leftWorks.length - 1);
                        zPos = zCenter + (ratio - 0.5) * 18;
                    }
                    
                    this.addArtworkToScene(work, new THREE.Vector3(xLeft, yOffset, zPos), Math.PI / 2, isFloating, style, zCenter);
                });
                
                const xRight = (style === 'cyber_void') ? 6 : 9.8;
                
                rightWorks.forEach((work, wIdx) => {
                    let zPos = zCenter;
                    if (rightWorks.length > 1) {
                        const ratio = wIdx / (rightWorks.length - 1);
                        zPos = zCenter + (ratio - 0.5) * 18;
                    }
                    
                    this.addArtworkToScene(work, new THREE.Vector3(xRight, yOffset, zPos), -Math.PI / 2, isFloating, style, zCenter);
                });
            }
        }
    },
    
    // Wall between two rooms, with a doorway matching the walking bounds in GalleryControls
    createPartitionWall(wallZ, wallMat, width, height) {
        const doorWidth = 6.0;
        const doorHeight = 4.5;
        const sideWidth = (width - doorWidth) / 2;
        const sideCenter = width/2 - sideWidth/2;
        
        // Seen from both rooms, so both faces must render
        const partitionMat = wallMat.clone();
        partitionMat.side = THREE.DoubleSide;
        
        const addPanel = (panelWidth, panelHeight, x, y) => {
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth, panelHeight), partitionMat);
            panel.position.set(x, y, wallZ);
            panel.receiveShadow = true;
            panel.userData = { isRoomGeo: true };
            this.scene.add(panel);
        };
        
        addPanel(sideWidth, height, -sideCenter, height/2);
        addPanel(sideWidth, height, sideCenter, height/2);
        addPanel(doorWidth, height - doorHeight, 0, height - (height - doorHeight)/2);
        
        const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.7 });
        const addFrame = (frameWidth, frameHeight, x, y) => {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, frameHeight, 0.4), doorFrameMat);
            frame.position.set(x, y, wallZ);
            frame.userData = { isRoomGeo: true, isDoor: true };
            this.scene.add(frame);
        };
        
        addFrame(0.1, doorHeight, -(doorWidth/2 + 0.05), doorHeight/2);
        addFrame(0.1, doorHeight, doorWidth/2 + 0.05, doorHeight/2);
        addFrame(doorWidth + 0.2, 0.1, 0, doorHeight);
    },
    
    // Create glowing neon particles for the cyber void zones
    createCyberParticles(zCenter) {
        const particleGeo = new THREE.BufferGeometry();
        const count = 200;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        
        const colorCyan = new THREE.Color('#d8d2c0');
        const colorPurple = new THREE.Color('#8a8578');
        
        for (let i = 0; i < count; i++) {
            positions[i*3] = (Math.random() - 0.5) * 24;
            positions[i*3+1] = Math.random() * 8;
            positions[i*3+2] = zCenter + (Math.random() - 0.5) * 30;
            
            const mixedColor = colorCyan.clone().lerp(colorPurple, Math.random());
            colors[i*3] = mixedColor.r;
            colors[i*3+1] = mixedColor.g;
            colors[i*3+2] = mixedColor.b;
        }
        
        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const pCanvas = document.createElement('canvas');
        pCanvas.width = 16;
        pCanvas.height = 16;
        const pCtx = pCanvas.getContext('2d');
        const grad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        pCtx.fillStyle = grad;
        pCtx.fillRect(0, 0, 16, 16);
        const pTexture = new THREE.CanvasTexture(pCanvas);
        
        const particleMat = new THREE.PointsMaterial({
            size: 0.12,
            vertexColors: true,
            map: pTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        return new THREE.Points(particleGeo, particleMat);
    },
    
    // Builds and mounts an artwork image plane and its frame in the 3D scene
    addArtworkToScene(work, position, rotationY, isFloating, roomStyle, zCenter) {
        const loader = new THREE.TextureLoader();
        
        loader.load(work.imageBase64, (texture) => {
            const aspect = texture.image.width / texture.image.height;
            const h = 2.0;
            const w = h * aspect;
            
            const group = new THREE.Group();
            
            // 1. Artwork Core Mesh (with self-emissive map so details are perfectly visible even in darker room settings)
            const artMat = new THREE.MeshStandardMaterial({ 
                map: texture, 
                roughness: 0.25, 
                side: THREE.DoubleSide,
                emissive: new THREE.Color(0xffffff),
                emissiveMap: texture,
                emissiveIntensity: 0.65 // Makes the image bright and clearly visible like a backlit frame
            });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat);
            plane.userData = work;
            plane.castShadow = true;
            group.add(plane);
            
            const frameStyle = (work.preset && work.preset.frame_style) || 
                               (roomStyle === 'cyber_void' ? 'frameless' : 
                               (roomStyle === 'sketch_studio' ? 'classic_wood' : 'minimal_metal'));
            
            const frameMeshes = [];
            let backglow = null;
            
            // 2. Custom Frame Construction
            if (frameStyle === 'classic_wood') {
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.6, metalness: 0.1 });
                const thickness = 0.06;
                const width = 0.08;
                
                const tb = new THREE.BoxGeometry(w + width * 2, width, thickness);
                const mTb1 = new THREE.Mesh(tb, frameMat);
                mTb1.position.set(0, h/2 + width/2, -thickness/2);
                mTb1.castShadow = true;
                group.add(mTb1);
                frameMeshes.push(mTb1);
                
                const mTb2 = new THREE.Mesh(tb, frameMat);
                mTb2.position.set(0, -h/2 - width/2, -thickness/2);
                mTb2.castShadow = true;
                group.add(mTb2);
                frameMeshes.push(mTb2);
                
                const lr = new THREE.BoxGeometry(width, h, thickness);
                const mLr1 = new THREE.Mesh(lr, frameMat);
                mLr1.position.set(w/2 + width/2, 0, -thickness/2);
                mLr1.castShadow = true;
                group.add(mLr1);
                frameMeshes.push(mLr1);
                
                const mLr2 = new THREE.Mesh(lr, frameMat);
                mLr2.position.set(-w/2 - width/2, 0, -thickness/2);
                mLr2.castShadow = true;
                group.add(mLr2);
                frameMeshes.push(mLr2);
                
            } else if (frameStyle === 'minimal_metal') {
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.3, metalness: 0.8 });
                const thickness = 0.03;
                const width = 0.04;
                
                const tb = new THREE.BoxGeometry(w + width * 2, width, thickness);
                const mTb1 = new THREE.Mesh(tb, frameMat);
                mTb1.position.set(0, h/2 + width/2, -thickness/2);
                group.add(mTb1);
                frameMeshes.push(mTb1);
                
                const mTb2 = new THREE.Mesh(tb, frameMat);
                mTb2.position.set(0, -h/2 - width/2, -thickness/2);
                group.add(mTb2);
                frameMeshes.push(mTb2);
                
                const lr = new THREE.BoxGeometry(width, h, thickness);
                const mLr1 = new THREE.Mesh(lr, frameMat);
                mLr1.position.set(w/2 + width/2, 0, -thickness/2);
                group.add(mLr1);
                frameMeshes.push(mLr1);
                
                const mLr2 = new THREE.Mesh(lr, frameMat);
                mLr2.position.set(-w/2 - width/2, 0, -thickness/2);
                group.add(mLr2);
                frameMeshes.push(mLr2);
            } else {
                const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.8 });
                const backing = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), backMat);
                backing.position.z = -0.01;
                group.add(backing);
                frameMeshes.push(backing);
                
                if (isFloating) {
                    const glowColor = (work.medium || '').toLowerCase().includes('3d') ? 0xff7700 : 0xfff0d0;
                    const glowGeo = new THREE.PlaneGeometry(w + 0.3, h + 0.3);
                    const glowMat = new THREE.MeshBasicMaterial({ 
                        color: glowColor,
                        transparent: true,
                        opacity: 0.15,
                        side: THREE.DoubleSide
                    });
                    backglow = new THREE.Mesh(glowGeo, glowMat);
                    backglow.position.z = -0.05;
                    group.add(backglow);
                }
            }
            
            // Set position and rotation
            group.position.copy(position);
            group.rotation.y = rotationY;
            
            this.scene.add(group);
            
            // 3. Custom Lighting per artwork
            let spotLight = null;
            if (!isFloating) {
                const spotColor = (roomStyle === 'sketch_studio') ? 0xffecc4 : 0xffffff;
                spotLight = new THREE.SpotLight(spotColor, 4.0, 15, 0.4, 0.5, 1.0);
                
                const lightZ = position.z + (rotationY > 0 ? 2.0 : -2.0);
                spotLight.position.set(position.x, 5.5, lightZ);
                spotLight.target = plane;
                spotLight.castShadow = true;
                spotLight.shadow.bias = -0.001;
                this.scene.add(spotLight);
            } else {
                const lightColor = (work.medium || '').toLowerCase().includes('3d') ? 0xffaa00 : 0xfff0d0;
                spotLight = new THREE.PointLight(lightColor, 2.5, 8, 1.5);
                spotLight.position.set(position.x, position.y, position.z);
                this.scene.add(spotLight);
            }
            
            // Normal vector for camera navigation offset
            const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY).normalize();
            
            const artworkItem = {
                group,
                plane,
                light: spotLight,
                backglow,
                normal,
                data: work,
                frameMeshes,
                isFloating,
                baseY: position.y,
                baseRotY: rotationY,
                baseZCenter: zCenter,
                phase: Math.random() * Math.PI * 2
            };
            
            this.artworksInScene.push(artworkItem);
            if (isFloating) {
                this.floatingArtworks.push(artworkItem);
            }
            
            // Update BoxHelper if this is the currently selected curation target
            if (this.curationMode && this.activeArtwork && this.activeArtwork.data.id === work.id) {
                this.activeArtwork = artworkItem;
                this.selectCurationArtwork(artworkItem);
            }
        });
    },
    
    // The bar wraps onto more rows on narrow screens; panels sit just below it
    syncTopOffset() {
        const barHeight = document.getElementById('top-bar').offsetHeight;
        document.documentElement.style.setProperty('--top-offset', `${barHeight + 12}px`);
    },
    
    onResize() {
        this.syncTopOffset();
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = clock.getDelta();
        const time = clock.getElapsedTime();
        
        if (this.controls) this.controls.update(delta);
        
        this.floatingArtworks.forEach(art => {
            // Only bob dynamically if NOT currently selected and active in drag curation!
            if (!this.curationMode || !this.activeArtwork || this.activeArtwork.data.id !== art.data.id || !this.controls.isDraggingArtwork) {
                art.group.position.y = art.baseY + Math.sin(time * 1.5 + art.phase) * 0.08;
                art.group.rotation.y = art.baseRotY + Math.cos(time * 0.6 + art.phase) * 0.04;
            }
            
            if (art.backglow) {
                art.backglow.material.opacity = 0.12 + Math.sin(time * 2.0 + art.phase) * 0.05;
            }
        });
        
        if (!this.curationMode) {
            this.handleProximity();
        }
        
        this.handleRaycasting();
        
        this.renderer.render(this.scene, this.camera);
    },
    
    updateActiveRoomDetector(force = false) {
        if (this.numExhibitions === 0) return;
        
        let roomIdx = Math.floor((-this.camera.position.z + 15) / 30);
        roomIdx = Math.max(0, Math.min(this.numExhibitions - 1, roomIdx));
        
        if (roomIdx !== this.activeRoomIndex || force) {
            this.activeRoomIndex = roomIdx;
            const exh = this.exhibitionsList[roomIdx];
            if (exh) {
                UI.updateExhibitionInfo(exh.name, this.getExhibitionDesc(exh.name));
                
                // Crossfade BGM automatically
                const exhConfig = this.data.exhibitions.find(e => e.name === exh.name);
                const targetBgm = exhConfig ? (exhConfig.bgm || 'ambient') : 'ambient';
                ProceduralBGM.transitionTo(targetBgm);
            }
        }
    },
    
    getExhibitionDesc(exhName) {
        const found = this.data.exhibitions.find(e => e.name === exhName);
        return found ? found.description : 'A curated space in this gallery.';
    },
    
    handleProximity() {
        if (this.controls.isLerping || this.curationMode) return;
        
        let nearestArt = null;
        let minDist = 4.0;
        
        const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        
        this.artworksInScene.forEach(art => {
            const dist = this.camera.position.distanceTo(art.group.position);
            if (dist < minDist) {
                const toArt = new THREE.Vector3().subVectors(art.group.position, this.camera.position).normalize();
                const dot = camDir.dot(toArt);
                
                if (dot > 0.4) {
                    minDist = dist;
                    nearestArt = art;
                }
            }
        });
        
        if (nearestArt) {
            if (this.activeArtwork !== nearestArt) {
                this.activeArtwork = nearestArt;
                UI.showDocent(nearestArt.data);
            }
        } else {
            if (this.activeArtwork && !this.controls.isInspecting) {
                this.activeArtwork = null;
                UI.hideDocent();
            }
        }
    },
    
    handleRaycasting() {
        if (this.controls.isLerping) return;
        
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = this.raycaster.intersectObjects(this.artworksInScene.map(a => a.plane));
        
        const crosshair = document.getElementById('crosshair');
        
        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            if (this.hoveredArtwork !== mesh) {
                this.hoveredArtwork = mesh;
                if (crosshair) crosshair.classList.add('hovering');
                document.body.style.cursor = 'pointer';
            }
        } else {
            if (this.hoveredArtwork) {
                this.hoveredArtwork = null;
                if (crosshair) crosshair.classList.remove('hovering');
                document.body.style.cursor = 'default';
            }
        }
    },
    
    inspectArtwork(mesh) {
        const art = this.artworksInScene.find(a => a.plane === mesh);
        if (!art) return;
        
        this.activeArtwork = art;
        this.controls.isInspecting = true;
        
        UI.showDocent(art.data);
        
        const targetPos = art.group.position.clone().add(art.normal.clone().multiplyScalar(2.2));
        targetPos.y = 1.7;
        
        const targetLookAt = art.group.position.clone();
        
        this.controls.lerpTo(targetPos, targetLookAt);
    },
    
    closeInspection() {
        this.controls.isInspecting = false;
        this.activeArtwork = null;
        UI.hideDocent();
        this.controls.stopLerp();
    },
    
    // Curation Mode Target Selection
    selectCurationArtwork(artItem) {
        if (this.selectedHelper) {
            this.scene.remove(this.selectedHelper);
        }
        
        this.activeArtwork = artItem;
        this.selectedHelper = new THREE.BoxHelper(artItem.group, '#ffcc00');
        this.scene.add(this.selectedHelper);
        
        // Push sliders UI
        UI.showCurationPanel(artItem);
    },
    
    deselectCurationArtwork() {
        if (this.selectedHelper) {
            this.scene.remove(this.selectedHelper);
            this.selectedHelper = null;
        }
        this.activeArtwork = null;
        UI.hideCurationPanel();
    }
};

// === CAMERA CONTROLS CLASS ===
class GalleryControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.move = { forward: false, backward: false, left: false, right: false };
        this.look = { up: false, down: false, left: false, right: false };
        this.rotation = { yaw: 0, pitch: 0 };
        
        this.speed = 4.5;
        this.rotSpeed = 1.2;
        this.sensitivity = 0.003;
        
        this.isMouseDown = false;
        this.hasMoved = false;
        this.prevMouse = { x: 0, y: 0 };
        
        this.isLerping = false;
        this.isInspecting = false;
        this.lookAtTarget = new THREE.Vector3();
        this.prevCameraState = null;
        
        // Curation Drag-and-Drop parameters
        this.isDraggingArtwork = false;
        this.dragPlane = null;
        this.dragOffset = new THREE.Vector3();
        
        this.init();
    }
    
    init() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        this.domElement.addEventListener('wheel', (e) => this.onWheel(e));
    }
    
    onKeyDown(e) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
            return;
        }
        
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
        
        switch(e.key.toLowerCase()) {
            case 'w':
            case 'arrowup': 
                this.move.forward = true; 
                break;
            case 's':
            case 'arrowdown': 
                this.move.backward = true; 
                break;
            case 'a': 
                this.move.left = true; 
                break;
            case 'd': 
                this.move.right = true; 
                break;
            case 'arrowleft': 
                this.look.left = true; 
                break;
            case 'arrowright': 
                this.look.right = true; 
                break;
            case 'e': 
                this.look.up = true; 
                break;
            case 'q': 
                this.look.down = true; 
                break;
            case 'escape':
                if (App.curationMode) {
                    App.deselectCurationArtwork();
                } else if (App.activeArtwork) {
                    App.closeInspection();
                }
                break;
        }
    }
    
    onKeyUp(e) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
            return;
        }
        
        switch(e.key.toLowerCase()) {
            case 'w':
            case 'arrowup': 
                this.move.forward = false; 
                break;
            case 's':
            case 'arrowdown': 
                this.move.backward = false; 
                break;
            case 'a': 
                this.move.left = false; 
                break;
            case 'd': 
                this.move.right = false; 
                break;
            case 'arrowleft': 
                this.look.left = false; 
                break;
            case 'arrowright': 
                this.look.right = false; 
                break;
            case 'e': 
                this.look.up = false; 
                break;
            case 'q': 
                this.look.down = false; 
                break;
        }
    }
    
    onMouseDown(e) {
        if (this.isLerping) return;
        
        this.isMouseDown = true;
        this.hasMoved = false;
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;
        
        // Handle Curation selection/dragging
        if (App.curationMode) {
            const mouse2D = new THREE.Vector2(
                (e.clientX / window.innerWidth) * 2 - 1,
                -(e.clientY / window.innerHeight) * 2 + 1
            );
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse2D, this.camera);
            const intersects = raycaster.intersectObjects(App.artworksInScene.map(a => a.plane));
            
            if (intersects.length > 0) {
                const clickedPlane = intersects[0].object;
                const artItem = App.artworksInScene.find(a => a.plane === clickedPlane);
                
                if (artItem) {
                    App.selectCurationArtwork(artItem);
                    
                    // Activate wall plane dragging setup
                    this.isDraggingArtwork = true;
                    
                    // Calculate wall alignment plane normal
                    const planeNormal = new THREE.Vector3();
                    if (Math.abs(artItem.normal.x) > 0.8) {
                        planeNormal.set(1, 0, 0); // Left/Right side walls
                    } else {
                        planeNormal.set(0, 0, 1); // Front/Back walls or floaters
                    }
                    
                    this.dragPlane = new THREE.Plane(planeNormal, -artItem.group.position.dot(planeNormal));
                    const intersectPoint = new THREE.Vector3();
                    raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
                    
                    this.dragOffset.copy(artItem.group.position).sub(intersectPoint);
                }
            } else {
                // Clicked blank space: clear active curation highlights
                if (e.target === this.domElement) {
                    App.deselectCurationArtwork();
                }
            }
        }
    }
    
    onMouseMove(e) {
        const mouse2D = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        
        // 1. Drag Artwork translation
        if (App.curationMode && this.isDraggingArtwork && App.activeArtwork) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse2D, this.camera);
            const intersectPoint = new THREE.Vector3();
            
            if (raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
                const newPos = intersectPoint.add(this.dragOffset);
                const art = App.activeArtwork;
                
                // Keep boundaries constrained within room dimensions
                const zCenter = art.baseZCenter;
                newPos.x = Math.max(-9.8, Math.min(9.8, newPos.x));
                newPos.y = Math.max(0.5, Math.min(7.5, newPos.y));
                newPos.z = Math.max(zCenter - 14.5, Math.min(zCenter + 14.5, newPos.z));
                
                art.group.position.copy(newPos);
                art.baseY = newPos.y; // Sync floating bases
                
                if (art.light) {
                    if (art.isFloating) {
                        art.light.position.copy(newPos);
                    } else {
                        art.light.position.set(newPos.x, 5.5, newPos.z + (art.baseRotY > 0 ? 2.0 : -2.0));
                    }
                }
                
                if (App.selectedHelper) App.selectedHelper.update();
                
                // Update 2D sliders in real-time
                UI.updateCurationSliders(newPos);
            }
            return;
        }
        
        // 2. Drag Camera looking
        if (!this.isMouseDown || this.isLerping) return;
        
        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.hasMoved = true;
        }
        
        this.rotation.yaw -= dx * this.sensitivity;
        this.rotation.pitch -= dy * this.sensitivity;
        this.rotation.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.rotation.pitch));
        
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;
    }
    
    onMouseUp(e) {
        if (this.isDraggingArtwork) {
            this.isDraggingArtwork = false;
            
            // Save final coordinates to database
            const art = App.activeArtwork;
            if (art) {
                const workId = art.data.id;
                const dbWork = App.data.artworks.find(w => w.id === workId);
                if (dbWork) {
                    dbWork.transform = {
                        x: art.group.position.x,
                        y: art.group.position.y,
                        z: art.group.position.z,
                        rotY: art.group.rotation.y
                    };
                    App.keepManualPlacement(dbWork);
                    Storage.save(App.data);
                }
            }
        }
        
        if (!this.isMouseDown) return;
        this.isMouseDown = false;
        
        // Simple click interaction triggers inspections (only outside curation modes)
        if (!App.curationMode && !this.hasMoved && e.target === this.domElement) {
            if (App.hoveredArtwork) {
                App.inspectArtwork(App.hoveredArtwork);
            } else if (this.isInspecting) {
                App.closeInspection();
            }
        }
    }
    
    onWheel(e) {
        this.camera.fov += e.deltaY * 0.04;
        this.camera.fov = Math.max(30, Math.min(85, this.camera.fov));
        this.camera.updateProjectionMatrix();
    }
    
    lerpTo(targetPos, targetLookAt) {
        this.isLerping = true;
        
        if (!this.prevCameraState) {
            this.prevCameraState = {
                pos: this.camera.position.clone(),
                yaw: this.rotation.yaw,
                pitch: this.rotation.pitch
            };
        }
        
        const currentDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.lookAtTarget.copy(this.camera.position).add(currentDirection);
        
        gsap.to(this.camera.position, {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 1.4,
            ease: "power2.inOut"
        });
        
        gsap.to(this.lookAtTarget, {
            x: targetLookAt.x,
            y: targetLookAt.y,
            z: targetLookAt.z,
            duration: 1.4,
            ease: "power2.inOut",
            onUpdate: () => {
                this.camera.lookAt(this.lookAtTarget);
            },
            onComplete: () => {
                this.isLerping = false;
                const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
                this.rotation.yaw = euler.y;
                this.rotation.pitch = euler.x;
                App.updateActiveRoomDetector();
            }
        });
    }
    
    stopLerp() {
        if (!this.prevCameraState) return;
        
        this.isLerping = true;
        
        const targetPos = this.prevCameraState.pos;
        const targetYaw = this.prevCameraState.yaw;
        const targetPitch = this.prevCameraState.pitch;
        
        const targetEuler = new THREE.Euler(targetPitch, targetYaw, 0, 'YXZ');
        const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);
        
        gsap.to(this.camera.position, {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 1.2,
            ease: "power2.inOut"
        });
        
        gsap.to(this.camera.quaternion, {
            x: targetQuat.x,
            y: targetQuat.y,
            z: targetQuat.z,
            w: targetQuat.w,
            duration: 1.2,
            ease: "power2.inOut",
            onComplete: () => {
                this.isLerping = false;
                this.rotation.yaw = targetYaw;
                this.rotation.pitch = targetPitch;
                this.prevCameraState = null;
                App.updateActiveRoomDetector();
            }
        });
    }
    
    update(delta) {
        if (this.isLerping) return;
        
        if (this.look.up) this.rotation.pitch += this.rotSpeed * delta;
        if (this.look.down) this.rotation.pitch -= this.rotSpeed * delta;
        if (this.look.left) this.rotation.yaw += this.rotSpeed * delta;
        if (this.look.right) this.rotation.yaw -= this.rotSpeed * delta;
        
        this.rotation.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.rotation.pitch));
        
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.rotation.yaw;
        this.camera.rotation.x = this.rotation.pitch;
        
        const moveDirection = new THREE.Vector3();
        
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        forward.y = 0;
        forward.normalize();
        
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        right.y = 0;
        right.normalize();
        
        if (this.move.forward) moveDirection.add(forward);
        if (this.move.backward) moveDirection.sub(forward);
        if (this.move.left) moveDirection.sub(right);
        if (this.move.right) moveDirection.add(right);
        
        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize().multiplyScalar(this.speed * delta);
            
            const prevPos = this.camera.position.clone();
            this.camera.position.add(moveDirection);
            
            this.camera.position.x = Math.max(-9.5, Math.min(9.5, this.camera.position.x));
            
            const minZ = -(App.numExhibitions - 1) * 30 - 14.0;
            const maxZ = 14.0;
            this.camera.position.z = Math.max(minZ, Math.min(maxZ, this.camera.position.z));
            
            // Partition wall collision: Block walk unless within doorway bounds (X: [-2.7, 2.7])
            for (let i = 0; i < App.numExhibitions - 1; i++) {
                const wallZ = -i * 30 - 15;
                if (Math.abs(this.camera.position.z - wallZ) < 0.6) {
                    if (Math.abs(this.camera.position.x) > 2.7) {
                        if (prevPos.z > wallZ) {
                            this.camera.position.z = wallZ + 0.6;
                        } else {
                            this.camera.position.z = wallZ - 0.6;
                        }
                    }
                }
            }
            
            App.updateActiveRoomDetector();
        }
        
        this.camera.position.y = 1.7;
    }
}

// === UI MANAGING SYSTEM ===
const UI = {
    init() {
        this.setupButtons();
        this.setupForms();
        this.setupCurationPanelListeners();
    },
    
    setupButtons() {
        // Toggle Left Sidebar
        const leftSidebar = document.getElementById('sidebar-left');
        document.getElementById('btn-works').onclick = () => {
            leftSidebar.classList.toggle('collapsed');
        };
        document.getElementById('close-sidebar').onclick = () => {
            leftSidebar.classList.add('collapsed');
        };
        
        // [+ New Exhibition] trigger
        document.getElementById('btn-new-exh').onclick = () => {
            this.showExhSettingsModal('', 'Create New Exhibition');
        };
        
        // Curation Toggle trigger
        const btnCuration = document.getElementById('btn-curation');
        btnCuration.onclick = () => {
            App.curationMode = !App.curationMode;
            
            if (App.curationMode) {
                btnCuration.classList.add('active');
                btnCuration.innerText = 'Curation: ON';
                document.getElementById('curation-hud').classList.add('visible');
                
                // Dismiss regular inspection overlays
                App.closeInspection();
            } else {
                btnCuration.classList.remove('active');
                btnCuration.innerText = 'Curation: OFF';
                document.getElementById('curation-hud').classList.remove('visible');
                
                // Clear curation helpers
                App.deselectCurationArtwork();
            }
        };
        
        // Floating modals triggers
        document.getElementById('btn-add').onclick = () => {
            this.showModal('modal-upload');
            document.getElementById('form-upload').reset();
            document.getElementById('modal-upload-title').innerText = 'Add artwork';
            document.getElementById('file-preview').removeAttribute('src');
            document.getElementById('file-preview-container').style.display = 'none';
            document.getElementById('input-id').value = '';
            document.getElementById('preset-fields').style.display = 'none';
        };
        
        document.getElementById('btn-about').onclick = () => {
            this.showModal('modal-about');
            document.getElementById('about-gallery-name').value = App.data.galleryName || '1116 Gallery';
            document.getElementById('about-gallery-name').readOnly = !Storage.isOwner;
            
            const listContainer = document.getElementById('about-exh-list');
            listContainer.innerHTML = '';
            
            App.data.exhibitions.forEach((exh, idx) => {
                const grp = document.createElement('div');
                grp.className = 'preset-details';
                grp.style.marginBottom = '1rem';
                grp.innerHTML = `
                    <div class="form-group" style="margin-bottom: 0.5rem;">
                        <label>Exhibition Title ${idx + 1}</label>
                        <input type="text" class="about-exh-title-input" data-id="${escapeHtml(exh.id)}" value="${escapeHtml(exh.name)}" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Exhibition Description</label>
                        <textarea class="about-exh-desc-input" data-id="${escapeHtml(exh.id)}" rows="2">${escapeHtml(exh.description)}</textarea>
                    </div>
                `;
                listContainer.appendChild(grp);
            });
            listContainer.querySelectorAll('input, textarea').forEach(field => {
                field.readOnly = !Storage.isOwner;
            });
        };
        
        this.setupBackupMenu();
        
        document.getElementById('btn-export').onclick = () => Storage.export();
        
        document.getElementById('btn-import').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                if (e.target.files[0]) {
                    Storage.import(e.target.files[0]);
                }
            };
            input.click();
        };
        
        document.getElementById('btn-help').onclick = () => this.showModal('modal-help');
        document.getElementById('btn-bgm').onclick = () => ProceduralBGM.toggleMuted();
        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();
        
        // Details caption buttons
        document.getElementById('close-docent').onclick = () => App.closeInspection();
        
        document.getElementById('btn-edit-work').onclick = () => {
            if (!App.activeArtwork) return;
            const work = App.activeArtwork.data;
            
            this.showModal('modal-upload');
            document.getElementById('modal-upload-title').innerText = 'Edit Artwork';
            
            document.getElementById('input-id').value = work.id;
            document.getElementById('input-title').value = work.title;
            document.getElementById('input-exh').value = work.exhibition || 'General Collection';
            document.getElementById('input-date').value = work.date || '';
            document.getElementById('input-medium').value = work.medium || '';
            document.getElementById('input-notes').value = work.notes || '';
            
            document.getElementById('file-preview').src = work.imageBase64;
            document.getElementById('file-preview-container').style.display = 'block';
            
            if (work.preset) {
                document.getElementById('toggle-preset-fields').checked = true;
                document.getElementById('preset-fields').style.display = 'block';
                document.getElementById('preset-space').value = work.preset.space_type || 'gallery';
                document.getElementById('preset-frame').value = work.preset.frame_style || 'minimal_metal';
            } else {
                document.getElementById('toggle-preset-fields').checked = false;
                document.getElementById('preset-fields').style.display = 'none';
            }
        };
        
        document.getElementById('btn-delete-work').onclick = () => {
            if (!App.activeArtwork) return;
            if (confirm('Are you sure you want to delete this artwork from the gallery?')) {
                const workId = App.activeArtwork.data.id;
                App.data.artworks = App.data.artworks.filter(a => a.id !== workId);
                
                Storage.save(App.data);
                App.closeInspection();
                App.reconstructGallery();
            }
        };
        
        // Curation Panel Deselect
        document.getElementById('close-curation').onclick = () => App.deselectCurationArtwork();
        document.getElementById('btn-curation-deselect').onclick = () => App.deselectCurationArtwork();
    },
    
    setupBackupMenu() {
        const toggle = document.getElementById('btn-backup');
        const menu = document.getElementById('backup-menu');
        
        const setOpen = (open) => {
            menu.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
        };
        
        toggle.onclick = () => setOpen(menu.hidden);
        menu.addEventListener('click', () => setOpen(false));
        document.addEventListener('click', (e) => {
            if (!menu.hidden && !e.target.closest('.nav-menu-wrap')) setOpen(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !menu.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });
    },
    
    setupForms() {
        document.getElementById('toggle-preset-fields').onchange = (e) => {
            document.getElementById('preset-fields').style.display = e.target.checked ? 'block' : 'none';
        };
        
        document.getElementById('input-file').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (re) => {
                    // Firestore documents are limited to 1 MiB, so shrink before previewing
                    document.getElementById('file-preview').src = await Storage.shrinkImage(re.target.result);
                    document.getElementById('file-preview-container').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        };
        
        // Submit Upload / Edit Artwork
        document.getElementById('form-upload').onsubmit = (e) => {
            e.preventDefault();
            
            const id = document.getElementById('input-id').value || Math.random().toString(36).substr(2, 9);
            const isEdit = !!document.getElementById('input-id').value;
            const previewImg = document.getElementById('file-preview');
            
            if (!isEdit && !previewImg.getAttribute('src')) {
                alert('Please upload an image file for the new artwork.');
                return;
            }
            
            const title = document.getElementById('input-title').value.trim();
            const exhibition = document.getElementById('input-exh').value.trim() || 'General Collection';
            const date = document.getElementById('input-date').value;
            const medium = document.getElementById('input-medium').value.trim() || 'Unspecified Medium';
            const notes = document.getElementById('input-notes').value.trim();
            
            let preset = null;
            if (document.getElementById('toggle-preset-fields').checked) {
                preset = {
                    space_type: document.getElementById('preset-space').value,
                    frame_style: document.getElementById('preset-frame').value
                };
            }
            
            const workData = {
                id,
                title,
                exhibition,
                date,
                medium,
                notes,
                imageBase64: previewImg.src,
                preset
            };
            
            // Check if exhibition exists in metadata, if not, create it
            const exhExists = App.data.exhibitions.some(ex => ex.name.toLowerCase() === exhibition.toLowerCase());
            if (!exhExists) {
                App.data.exhibitions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: exhibition,
                    description: 'A new collection of works.',
                    style: 'default_gallery',
                    bgm: 'ambient',
                    layout_mode: 'auto',
                    lights: { type: 'spotlight', color: '#ffffff', intensity: 1.0 }
                });
            }
            
            if (isEdit) {
                const index = App.data.artworks.findIndex(a => a.id === id);
                if (index !== -1) App.data.artworks[index] = workData;
            } else {
                App.data.artworks.push(workData);
            }
            
            Storage.save(App.data);
            App.reconstructGallery();
            this.hideModal('modal-upload');
        };
        
        // Save About Gallery modal changes
        document.getElementById('btn-save-about').onclick = () => {
            App.data.galleryName = document.getElementById('about-gallery-name').value.trim() || '1116 Gallery';
            
            const titleInputs = document.querySelectorAll('.about-exh-title-input');
            const descInputs = document.querySelectorAll('.about-exh-desc-input');
            
            titleInputs.forEach((input, index) => {
                const id = input.getAttribute('data-id');
                const matchingExh = App.data.exhibitions.find(e => e.id === id);
                if (matchingExh) {
                    const oldName = matchingExh.name;
                    const newName = input.value.trim() || oldName;
                    const desc = descInputs[index].value.trim();
                    
                    matchingExh.name = newName;
                    matchingExh.description = desc;
                    
                    App.data.artworks.forEach(w => {
                        if ((w.exhibition || 'General Collection') === oldName) {
                            w.exhibition = newName;
                        }
                    });
                }
            });
            
            Storage.save(App.data);
            App.reconstructGallery();
            this.hideModal('modal-about');
        };
        
        // Submit Exhibition Settings Form (Edit / Create Room)
        document.getElementById('form-exh-settings').onsubmit = (e) => {
            e.preventDefault();
            
            const oldName = document.getElementById('exh-settings-old-name').value;
            const newName = document.getElementById('exh-settings-name').value.trim();
            const desc = document.getElementById('exh-settings-desc').value.trim();
            const style = document.getElementById('exh-settings-style').value;
            const bgm = document.getElementById('exh-settings-bgm').value;
            const lightType = document.getElementById('exh-settings-light-type').value;
            const layoutMode = document.getElementById('exh-settings-layout').value;
            const lightColor = document.getElementById('exh-settings-light-color').value;
            const lightIntensity = parseFloat(document.getElementById('exh-settings-light-intensity').value);
            
            if (!oldName) {
                // Spawning a completely new Room
                const newExh = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: newName,
                    description: desc,
                    style: style,
                    bgm: bgm,
                    layout_mode: layoutMode,
                    lights: { type: lightType, color: lightColor, intensity: lightIntensity }
                };
                App.data.exhibitions.push(newExh);
            } else {
                // Editing existing Room settings
                const match = App.data.exhibitions.find(ex => ex.name === oldName);
                if (match) {
                    match.name = newName;
                    match.description = desc;
                    match.style = style;
                    match.bgm = bgm;
                    match.layout_mode = layoutMode;
                    match.lights = { type: lightType, color: lightColor, intensity: lightIntensity };
                    
                    // Rename references in artworks database
                    App.data.artworks.forEach(w => {
                        if ((w.exhibition || 'General Collection') === oldName) {
                            w.exhibition = newName;
                        }
                    });
                }
            }
            
            Storage.save(App.data);
            App.reconstructGallery();
            this.hideModal('modal-exh-settings');
        };
        
        // Delete Exhibition Room
        document.getElementById('btn-delete-exh').onclick = () => {
            const oldName = document.getElementById('exh-settings-old-name').value;
            if (!oldName) {
                this.hideModal('modal-exh-settings');
                return;
            }
            
            if (confirm(`Delete the room "${oldName}"? This will delete all artworks associated with this exhibition.`)) {
                App.data.exhibitions = App.data.exhibitions.filter(ex => ex.name !== oldName);
                App.data.artworks = App.data.artworks.filter(w => (w.exhibition || 'General Collection') !== oldName);
                
                Storage.save(App.data);
                App.reconstructGallery();
                this.hideModal('modal-exh-settings');
            }
        };
    },
    
    // Exhibition settings form binder
    showExhSettingsModal(name, modalTitle = 'Exhibition Settings') {
        document.getElementById('exh-settings-title').innerText = modalTitle;
        document.getElementById('exh-settings-old-name').value = name;
        
        const btnDelete = document.getElementById('btn-delete-exh');
        
        if (!name) {
            // New room setup defaults
            document.getElementById('form-exh-settings').reset();
            btnDelete.style.display = 'none';
        } else {
            // Populate settings inputs
            const match = App.data.exhibitions.find(ex => ex.name === name);
            if (match) {
                document.getElementById('exh-settings-name').value = match.name;
                document.getElementById('exh-settings-desc').value = match.description || '';
                document.getElementById('exh-settings-style').value = match.style || 'default_gallery';
                document.getElementById('exh-settings-bgm').value = match.bgm || 'none';
                document.getElementById('exh-settings-layout').value = match.layout_mode || 'auto';
                
                if (match.lights) {
                    document.getElementById('exh-settings-light-type').value = match.lights.type || 'spotlight';
                    document.getElementById('exh-settings-light-color').value = match.lights.color || '#ffffff';
                    document.getElementById('exh-settings-light-intensity').value = match.lights.intensity || 1.0;
                } else {
                    document.getElementById('exh-settings-light-type').value = 'spotlight';
                    document.getElementById('exh-settings-light-color').value = '#ffffff';
                    document.getElementById('exh-settings-light-intensity').value = 1.0;
                }
                btnDelete.style.display = 'block';
            }
        }
        
        this.showModal('modal-exh-settings');
    },
    
    setupCurationPanelListeners() {
        const slideX = document.getElementById('slide-x');
        const slideY = document.getElementById('slide-y');
        const slideZ = document.getElementById('slide-z');
        const slideRotY = document.getElementById('slide-roty');
        const checkFloat = document.getElementById('curation-floating');
        
        const updateMeshFromUI = () => {
            const art = App.activeArtwork;
            if (!art) return;
            
            const x = parseFloat(slideX.value);
            const y = parseFloat(slideY.value);
            const z = parseFloat(slideZ.value);
            const rotY = parseFloat(slideRotY.value) * (Math.PI / 180);
            
            art.group.position.set(x, y, z);
            art.group.rotation.y = rotY;
            
            // Sync bases
            art.baseY = y;
            art.baseRotY = rotY;
            art.isFloating = checkFloat.checked;
            
            // Re-render lights
            if (art.light) {
                if (art.isFloating) {
                    art.light.position.set(x, y, z);
                } else {
                    art.light.position.set(x, 5.5, z + (rotY > 0 ? 2.0 : -2.0));
                }
            }
            
            if (App.selectedHelper) App.selectedHelper.update();
            
            // Update labels
            document.getElementById('val-x').innerText = x.toFixed(1);
            document.getElementById('val-y').innerText = y.toFixed(1);
            document.getElementById('val-z').innerText = z.toFixed(1);
            document.getElementById('val-roty').innerText = `${slideRotY.value}°`;
            
            // Save changes to database
            const dbWork = App.data.artworks.find(w => w.id === art.data.id);
            if (dbWork) {
                dbWork.transform = { x, y, z, rotY };
                if (!dbWork.preset) dbWork.preset = {};
                // Force space theme style if floating void triggered
                dbWork.preset.space_type = checkFloat.checked ? 'cyber_void' : 'gallery';
                App.keepManualPlacement(dbWork);
                Storage.save(App.data);
            }
        };
        
        slideX.oninput = updateMeshFromUI;
        slideY.oninput = updateMeshFromUI;
        slideZ.oninput = updateMeshFromUI;
        slideRotY.oninput = updateMeshFromUI;
        checkFloat.onchange = updateMeshFromUI;
    },
    
    showCurationPanel(artItem) {
        const panel = document.getElementById('curation-panel');
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.add('visible'), 10);
        
        document.getElementById('curation-work-title').innerText = artItem.data.title;
        
        const pos = artItem.group.position;
        const rotY = Math.round(artItem.group.rotation.y * (180 / Math.PI));
        
        const slideX = document.getElementById('slide-x');
        const slideY = document.getElementById('slide-y');
        const slideZ = document.getElementById('slide-z');
        const slideRotY = document.getElementById('slide-roty');
        const checkFloat = document.getElementById('curation-floating');
        
        slideX.value = pos.x;
        slideY.value = pos.y;
        
        // Dynamically adjust Z sliders range based on the active room coordinate borders
        const zCenter = artItem.baseZCenter;
        slideZ.min = zCenter - 14.5;
        slideZ.max = zCenter + 14.5;
        slideZ.value = pos.z;
        
        slideRotY.value = (rotY < 0 ? 360 + rotY : rotY) % 360;
        checkFloat.checked = artItem.isFloating;
        
        document.getElementById('val-x').innerText = pos.x.toFixed(1);
        document.getElementById('val-y').innerText = pos.y.toFixed(1);
        document.getElementById('val-z').innerText = pos.z.toFixed(1);
        document.getElementById('val-roty').innerText = `${slideRotY.value}°`;
    },
    
    updateCurationSliders(pos) {
        document.getElementById('slide-x').value = pos.x;
        document.getElementById('slide-y').value = pos.y;
        document.getElementById('slide-z').value = pos.z;
        
        document.getElementById('val-x').innerText = pos.x.toFixed(1);
        document.getElementById('val-y').innerText = pos.y.toFixed(1);
        document.getElementById('val-z').innerText = pos.z.toFixed(1);
    },
    
    hideCurationPanel() {
        const panel = document.getElementById('curation-panel');
        panel.classList.remove('visible');
        setTimeout(() => panel.style.display = 'none', 300);
    },
    
    showModal(id) {
        const modal = document.getElementById(id);
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    },
    
    hideModal(id) {
        const modal = document.getElementById(id);
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    },
    
    updateExhibitionInfo(title, desc) {
        document.getElementById('zone-exh-title').innerText = title;
        document.getElementById('zone-gallery-title').innerText = App.data.galleryName || '1116 Gallery';
    },
    
    showDocent(work) {
        const panel = document.getElementById('docent-panel');
        panel.style.display = 'flex';
        setTimeout(() => panel.classList.add('visible'), 10);
        
        document.getElementById('docent-img').src = work.imageBase64;
        document.getElementById('docent-title').innerText = work.title;
        document.getElementById('docent-exh').innerText = work.exhibition || 'General Collection';
        document.getElementById('docent-notes').innerText = work.notes || 'No process notes.';
        
        const dateStr = work.date ? new Date(work.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Unknown Date';
        document.getElementById('docent-meta').innerHTML = `
            <span class="meta-badge">${dateStr}</span>
            <span class="meta-badge">${escapeHtml(work.medium || 'Unknown Medium')}</span>
        `;
        
    },
    
    hideDocent() {
        const panel = document.getElementById('docent-panel');
        panel.classList.remove('visible');
    },
    
    // Renders list of works grouped by Exhibition inside left sidebar with Edit settings gears
    syncSidebar() {
        const container = document.getElementById('sidebar-works-container');
        container.innerHTML = '';
        
        const groups = {};
        App.data.artworks.forEach(w => {
            const exh = w.exhibition || 'General Collection';
            if (!groups[exh]) groups[exh] = [];
            groups[exh].push(w);
        });
        
        // Also populate empty exhibitions in the list
        App.data.exhibitions.forEach(ex => {
            if (!groups[ex.name]) groups[ex.name] = [];
        });
        
        Object.keys(groups).forEach(exhName => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'exhibition-group';
            
            const header = document.createElement('div');
            header.className = 'exhibition-title-header';
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>${escapeHtml(exhName)}</span>
                    <span class="exh-settings-icon" data-name="${escapeHtml(exhName)}">⚙️</span>
                </div>
                <span style="font-size:0.75rem; opacity:0.6">${groups[exhName].length} works</span>
            `;
            
            const listDiv = document.createElement('div');
            listDiv.className = 'exh-works-list';
            
            // Navigate camera to exhibition room on group header click (except when gear clicked)
            header.onclick = (e) => {
                if (e.target.classList.contains('exh-settings-icon')) {
                    const name = e.target.getAttribute('data-name');
                    this.showExhSettingsModal(name);
                    return;
                }
                
                const roomInfo = App.exhibitionsList.find(ex => ex.name === exhName);
                if (roomInfo) {
                    App.closeInspection();
                    App.controls.lerpTo(new THREE.Vector3(0, 1.7, roomInfo.zCenter), new THREE.Vector3(0, 1.7, roomInfo.zCenter - 5));
                }
            };
            
            groups[exhName].forEach(work => {
                const workDiv = document.createElement('div');
                workDiv.className = 'work-item';
                if (App.activeArtwork && App.activeArtwork.data.id === work.id) {
                    workDiv.classList.add('active');
                }
                
                const dateStr = work.date ? new Date(work.date).toLocaleDateString(undefined, { year: 'numeric', timeZone: 'UTC' }) : 'N/A';
                
                workDiv.innerHTML = `
                    <img src="${escapeHtml(work.imageBase64)}" class="work-thumb" alt="">
                    <div class="work-info">
                        <div class="work-name">${escapeHtml(work.title)}</div>
                        <div class="work-date-med">${dateStr} · ${escapeHtml(work.medium)}</div>
                    </div>
                `;
                
                workDiv.onclick = (e) => {
                    e.stopPropagation();
                    
                    if (App.curationMode) {
                        const targetMesh = App.artworksInScene.find(a => a.data.id === work.id);
                        if (targetMesh) {
                            App.selectCurationArtwork(targetMesh);
                            document.querySelectorAll('.work-item').forEach(wi => wi.classList.remove('active'));
                            workDiv.classList.add('active');
                        }
                    } else {
                        App.closeInspection();
                        const targetMesh = App.artworksInScene.find(a => a.data.id === work.id);
                        if (targetMesh) {
                            App.inspectArtwork(targetMesh.plane);
                            document.querySelectorAll('.work-item').forEach(wi => wi.classList.remove('active'));
                            workDiv.classList.add('active');
                        }
                    }
                };
                
                listDiv.appendChild(workDiv);
            });
            
            groupDiv.appendChild(header);
            groupDiv.appendChild(listDiv);
            container.appendChild(groupDiv);
        });
    },
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error("Fullscreen request failed:", err);
            });
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }
};

// === DATABASE MANAGEMENT / STORAGE ===
const Storage = {
    LEGACY_KEY: 'antigravity_archive', // Pre-Firebase data kept in this browser
    META_DOC: 'galleries/main',
    WORKS: 'artworks',
    MAX_IMAGE_CHARS: 900000, // Leaves room under Firestore's 1 MiB document limit
    
    isOwner: false,
    cloudAvailable: false,
    cloudHasGallery: false,
    syncedWorks: new Map(), // artwork id -> JSON last written to Firestore
    syncedMeta: null,
    saveTimer: null,
    statusTimer: null,
    dirty: false,
    queue: Promise.resolve(),
    
    db() {
        return firebase.firestore();
    },
    
    async load() {
        try {
            const [metaSnap, worksSnap] = await Promise.all([
                this.db().doc(this.META_DOC).get(),
                this.db().collection(this.WORKS).get()
            ]);
            this.cloudAvailable = true;
            
            if (metaSnap.exists) {
                const meta = metaSnap.data();
                const order = meta.artworkOrder || [];
                const rank = (work) => {
                    const i = order.indexOf(work.id);
                    return i === -1 ? order.length : i;
                };
                const data = {
                    galleryName: meta.galleryName,
                    exhibitions: meta.exhibitions || [],
                    artworks: worksSnap.docs.map(doc => doc.data()).sort((a, b) => rank(a) - rank(b))
                };
                this.cloudHasGallery = true;
                this.markSynced(data);
                return data;
            }
        } catch (err) {
            console.error('Could not load the gallery from Firestore, showing samples.', err);
        }
        
        return this.defaultData();
    },
    
    defaultData() {
        return {
            galleryName: "1116 Gallery",
            exhibitions: [
                { 
                    id: 'exh-1', 
                    name: 'Classical Studies', 
                    description: 'Exploring organic structures and classic textures through pencil work and heavy media studies.',
                    style: 'sketch_studio',
                    bgm: 'ambient',
                    layout_mode: 'auto',
                    lights: { type: 'spotlight', color: '#fff5e6', intensity: 1.2 }
                },
                { 
                    id: 'exh-2', 
                    name: 'Neo-Futurism', 
                    description: 'Floating high-concept neon arrays showcasing anti-gravity space voids and cyberpunk metallic structures.',
                    style: 'cyber_void',
                    bgm: 'lo-fi',
                    layout_mode: 'auto',
                    lights: { type: 'point', color: '#fff0d0', intensity: 1.5 }
                },
                { 
                    id: 'exh-3', 
                    name: 'Ethereal Plains', 
                    description: 'Tranquil washes of color capturing atmospheric landscapes inspired by Japanese ink washes.',
                    style: 'default_gallery',
                    bgm: 'classic',
                    layout_mode: 'auto',
                    lights: { type: 'spotlight', color: '#ffffff', intensity: 1.0 }
                }
            ],
            artworks: this.generateSampleArtworks()
        };
    },
    
    metaOf(data) {
        return {
            galleryName: data.galleryName || '1116 Gallery',
            exhibitions: data.exhibitions,
            artworkOrder: data.artworks.map(work => work.id)
        };
    },
    
    markSynced(data) {
        this.syncedWorks = new Map(data.artworks.map(work => [work.id, JSON.stringify(work)]));
        this.syncedMeta = JSON.stringify(this.metaOf(data));
    },
    
    // Callers fire this on every edit (sliders included), so writes are batched
    save(data) {
        if (!this.isOwner) {
            this.showStatus('Not saved. Sign in to make changes.');
            return;
        }
        this.showStatus('Saving…');
        this.dirty = true;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(data), 600);
    },
    
    flush(data) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.queue = this.queue.then(() => this.sync(data)).then(() => {
            if (!this.saveTimer) this.showStatus('Saved', 2500);
        }).catch((err) => {
            console.error('Failed to save to Firestore.', err);
            this.showStatus('Not saved');
            alert(`Your changes could not be saved: ${err.message}`);
            throw err;
        }).finally(() => {
            if (!this.saveTimer) this.dirty = false;
        });
        const result = this.queue;
        this.queue = result.catch(() => {});
        return result;
    },
    
    // Pass hideAfterMs for messages that should clear on their own
    showStatus(text, hideAfterMs) {
        const status = document.getElementById('save-status');
        clearTimeout(this.statusTimer);
        status.innerText = text;
        status.hidden = false;
        if (hideAfterMs) {
            this.statusTimer = setTimeout(() => { status.hidden = true; }, hideAfterMs);
        }
    },
    
    // Writes only what changed since the last successful sync
    async sync(data) {
        if (!this.cloudAvailable) {
            throw new Error('The gallery database could not be reached. Reload and try again.');
        }
        
        for (const work of data.artworks) {
            const json = JSON.stringify(work);
            if (this.syncedWorks.get(work.id) === json) continue;
            if ((work.imageBase64 || '').length > 1000000) {
                throw new Error(`"${work.title}" is too large to store.`);
            }
            await this.db().collection(this.WORKS).doc(work.id).set(JSON.parse(json));
            this.syncedWorks.set(work.id, json);
        }
        
        const liveIds = new Set(data.artworks.map(work => work.id));
        for (const id of [...this.syncedWorks.keys()]) {
            if (liveIds.has(id)) continue;
            await this.db().collection(this.WORKS).doc(id).delete();
            this.syncedWorks.delete(id);
        }
        
        const meta = JSON.stringify(this.metaOf(data));
        if (meta !== this.syncedMeta) {
            await this.db().doc(this.META_DOC).set(JSON.parse(meta));
            this.syncedMeta = meta;
        }
        this.cloudHasGallery = true;
    },
    
    // Replaces the whole gallery, then reloads to show it
    async replaceAll(data) {
        for (const work of data.artworks) {
            work.imageBase64 = await this.shrinkImage(work.imageBase64);
        }
        await this.flush(data);
        window.location.reload();
    },
    
    // Resizes an image data URL until it fits in a Firestore document
    shrinkImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onerror = () => reject(new Error('This image could not be read.'));
            img.onload = () => {
                let maxSide = 1600;
                if (src.length <= this.MAX_IMAGE_CHARS && Math.max(img.width, img.height) <= maxSide) {
                    resolve(src);
                    return;
                }
                
                let quality = 0.85;
                while (true) {
                    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    const result = canvas.toDataURL('image/jpeg', quality);
                    if (result.length <= this.MAX_IMAGE_CHARS || maxSide < 400) {
                        resolve(result);
                        return;
                    }
                    if (quality > 0.6) quality -= 0.1;
                    else maxSide *= 0.8;
                }
            };
            img.src = src;
        });
    },
    
    // One-time move of works saved in this browser before Firebase was connected
    async offerLegacyUpload() {
        if (this.cloudHasGallery || !this.cloudAvailable) return;
        
        let legacy = null;
        try {
            legacy = JSON.parse(localStorage.getItem(this.LEGACY_KEY));
        } catch (err) {
            console.error('Could not read the gallery saved in this browser.', err);
        }
        if (!this.isValidArchive(legacy)) return;
        
        if (confirm(`Upload the ${legacy.artworks.length} works saved in this browser to the online gallery?`)) {
            await this.replaceAll(legacy);
        }
    },
    
    isValidArchive(data) {
        return !!data && Array.isArray(data.exhibitions) && Array.isArray(data.artworks) &&
            data.artworks.every(work => work && work.id && typeof work.imageBase64 === 'string');
    },
    
    export() {
        const data = App.data;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(data.galleryName || '1116 Gallery').replace(/\s+/g, '_')}_archive.json`;
        a.click();
    },
    
    import(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            let data = null;
            try {
                data = JSON.parse(e.target.result);
            } catch (err) {
                console.error('Archive is not valid JSON.', err);
            }
            if (!this.isValidArchive(data)) {
                alert('This file is not a gallery backup. Choose a file made with Download backup.');
                return;
            }
            const countWorks = (n) => `${n} ${n === 1 ? 'work' : 'works'}`;
            const replaced = countWorks(App.data.artworks.length);
            const restored = countWorks(data.artworks.length);
            if (confirm(`Replace the ${replaced} in the gallery with the ${restored} in this backup? This can't be undone.`)) {
                await this.replaceAll(data);
            }
        };
        reader.readAsText(file);
    },
    
    generateSampleArtworks() {
        const artworks = [];
        
        const makeArtwork = (w, h, drawCallback) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            drawCallback(ctx, w, h);
            return canvas.toDataURL('image/jpeg', 0.9);
        };
        
        // 1. Classical Studies - Pencil Study
        const imgPencil = makeArtwork(800, 1000, (ctx, w, h) => {
            ctx.fillStyle = '#f2edd9';
            ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = 'rgba(0,0,0,0.03)';
            for (let i = 0; i < 5000; i++) {
                ctx.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5);
            }
            
            ctx.strokeStyle = '#2b2a26';
            ctx.lineWidth = 1.5;
            
            ctx.beginPath();
            ctx.arc(400, 350, 150, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(400, 200); ctx.lineTo(400, 500);
            ctx.moveTo(250, 350); ctx.lineTo(550, 350);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(40, 38, 33, 0.08)';
            for (let j = 0; j < 30; j++) {
                ctx.beginPath();
                ctx.arc(380 + (Math.random() - 0.5)*80, 360 + (Math.random() - 0.5)*80, 50 + Math.random()*50, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.strokeStyle = 'rgba(43, 42, 38, 0.5)';
            for (let k = 0; k < 60; k++) {
                ctx.beginPath();
                const sx = 250 + Math.random() * 300;
                const sy = 200 + Math.random() * 300;
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + (Math.random() - 0.5)*100, sy + (Math.random() - 0.5)*100);
                ctx.stroke();
            }
            
            ctx.fillStyle = '#3c3a33';
            ctx.fillRect(250, 700, 300, 200);
            ctx.strokeRect(250, 700, 300, 200);
        });
        
        artworks.push({
            id: 'art-pencil-study',
            title: 'Anatomy Study in Graphite',
            exhibition: 'Classical Studies',
            date: '2026-01-10',
            medium: 'Pencil Sketch',
            notes: 'A structural study of proportion and volume. Hand-drawn crosshatching using 2B/4B lead pencils on 150gsm archival parchment paper.',
            imageBase64: imgPencil,
            preset: { space_type: 'sketch_studio', frame_style: 'classic_wood' }
        });
        
        // 2. Classical Studies - Oil painting
        const imgOil = makeArtwork(1000, 800, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#3a1f04');
            grad.addColorStop(0.5, '#8a5a22');
            grad.addColorStop(1, '#1b0d02');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            
            for (let i = 0; i < 400; i++) {
                const rx = Math.random() * w;
                const ry = Math.random() * h;
                const rw = 80 + Math.random() * 150;
                const rh = 15 + Math.random() * 40;
                
                ctx.fillStyle = `rgba(${200 + Math.random()*55}, ${140 + Math.random()*80}, ${30 + Math.random()*50}, ${0.15})`;
                ctx.beginPath();
                ctx.ellipse(rx, ry, rw, rh, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.fillStyle = '#f3c15d';
            ctx.beginPath();
            ctx.arc(500, 400, 180, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 15;
            ctx.stroke();
        });
        
        artworks.push({
            id: 'art-oil-contemplation',
            title: 'Sienna Contemplation',
            exhibition: 'Classical Studies',
            date: '2026-02-15',
            medium: 'Oil Painting',
            notes: 'Exploring warm organic hues and light-scattering pigments. Layered acrylic bases topped with thick cadmium-yellow oil glazes.',
            imageBase64: imgOil,
            preset: { space_type: 'sketch_studio', frame_style: 'classic_wood' }
        });
        
        // 3. Neo-Futurism - Cyberpunk City
        const imgCyber = makeArtwork(1000, 800, (ctx, w, h) => {
            ctx.fillStyle = '#06050e';
            ctx.fillRect(0, 0, w, h);
            
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= w; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i, h);
                ctx.lineTo(w / 2, h / 2 + 50);
                ctx.stroke();
            }
            for (let j = h; j >= h / 2 + 50; j -= 30) {
                ctx.beginPath();
                ctx.moveTo(0, j);
                ctx.lineTo(w, j);
                ctx.stroke();
            }
            
            const colors = ['#00f2fe', '#7f00ff', '#ff007f'];
            for (let k = 0; k < 12; k++) {
                const tw = 40 + Math.random() * 80;
                const th = 200 + Math.random() * 350;
                const tx = 100 + Math.random() * (w - 300);
                const ty = h - th - 50;
                
                ctx.fillStyle = 'rgba(10, 8, 25, 0.95)';
                ctx.fillRect(tx, ty, tw, th);
                
                ctx.strokeStyle = colors[k % 3];
                ctx.lineWidth = 3;
                ctx.strokeRect(tx, ty, tw, th);
                
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                for (let wx = tx + 10; wx < tx + tw - 10; wx += 15) {
                    for (let wy = ty + 15; wy < ty + th - 20; wy += 25) {
                        if (Math.random() > 0.4) {
                            ctx.fillStyle = colors[Math.floor(Math.random()*3)];
                            ctx.fillRect(wx, wy, 4, 10);
                        }
                    }
                }
            }
        });
        
        artworks.push({
            id: 'art-cyber-metropolis',
            title: 'Grid Corridor Gridlock',
            exhibition: 'Neo-Futurism',
            date: '2026-04-05',
            medium: 'Digital Painting',
            notes: 'High-density vector rendering simulating architectural wireframes. Designed using multi-layer linear gradients under soft neon lighting models.',
            imageBase64: imgCyber,
            preset: { space_type: 'cyber_void', frame_style: 'frameless' }
        });
        
        // 4. Neo-Futurism - 3D Mechanical Drone
        const imgDrone = makeArtwork(1000, 1000, (ctx, w, h) => {
            ctx.fillStyle = '#0a0d16';
            ctx.fillRect(0, 0, w, h);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1;
            for (let i = 0; i < w; i += 40) {
                ctx.beginPath();
                ctx.moveTo(i, 0); ctx.lineTo(i, h);
                ctx.moveTo(0, i); ctx.lineTo(w, i);
                ctx.stroke();
            }
            
            ctx.fillStyle = '#1c2336';
            ctx.strokeStyle = '#ff7700';
            ctx.lineWidth = 4;
            
            const grad = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, 120);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, '#ffaa00');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(w/2, h/2, 120, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(w/2, h/2, 220, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(255, 119, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(100, h/2); ctx.lineTo(w - 100, h/2);
            ctx.moveTo(w/2, 100); ctx.lineTo(w/2, h - 100);
            ctx.stroke();
        });
        
        artworks.push({
            id: 'art-tech-sentinel',
            title: 'Aero-cruiser Core',
            exhibition: 'Neo-Futurism',
            date: '2026-05-18',
            medium: '3D Modeling',
            notes: 'Subdivision surface mechanics detailing. Modeled in Blender and rendered using cycles tracing. Designed to explore floating physics.',
            imageBase64: imgDrone,
            preset: { space_type: 'cyber_void', frame_style: 'frameless' }
        });
        
        // 5. Ethereal Plains - Watercolor
        const imgWater = makeArtwork(1000, 800, (ctx, w, h) => {
            ctx.fillStyle = '#e8f1f5';
            ctx.fillRect(0, 0, w, h);
            
            const drawMountain = (yOffset, fillStyle, amp) => {
                ctx.fillStyle = fillStyle;
                ctx.beginPath();
                ctx.moveTo(0, h);
                ctx.lineTo(0, yOffset);
                for (let x = 0; x <= w; x += 20) {
                    const y = yOffset + Math.sin(x * 0.01) * amp + Math.cos(x * 0.02) * (amp / 2);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(w, h);
                ctx.fill();
            };
            
            drawMountain(300, 'rgba(120, 160, 190, 0.3)', 60);
            drawMountain(420, 'rgba(80, 120, 150, 0.45)', 40);
            drawMountain(550, 'rgba(40, 70, 100, 0.6)', 30);
            
            ctx.fillStyle = 'rgba(20, 30, 50, 0.85)';
            ctx.fillRect(700, 480, 50, 70);
            ctx.beginPath();
            ctx.moveTo(680, 480);
            ctx.lineTo(770, 480);
            ctx.lineTo(725, 450);
            ctx.closePath();
            ctx.fill();
        });
        
        artworks.push({
            id: 'art-watercolor-mist',
            title: 'Echoes in the Mist',
            exhibition: 'Ethereal Plains',
            date: '2026-06-12',
            medium: 'Watercolor',
            notes: 'Capturing atmospheric humidity and organic silhouettes. Pure water wash overlayed with high-pigment cobalt blue ink washes.',
            imageBase64: imgWater,
            preset: { space_type: 'default_gallery', frame_style: 'minimal_metal' }
        });
        
        return artworks;
    }
};

// === OWNER SIGN-IN ===
// Firestore rules decide who the owner is, so no account details live in this file.
// The sign-in button only appears on the #admin URL; visitors never see it.
const Auth = {
    init() {
        if (!window.firebase) return;
        
        const login = document.getElementById('btn-login');
        const logout = document.getElementById('btn-logout');
        const refreshLoginButton = () => {
            login.hidden = !!firebase.auth().currentUser || window.location.hash !== '#admin';
        };
        
        login.onclick = () => {
            document.getElementById('form-login').reset();
            document.getElementById('login-error').hidden = true;
            UI.showModal('modal-login');
        };
        document.getElementById('form-login').onsubmit = (e) => this.submitLogin(e);
        logout.onclick = () => firebase.auth().signOut().then(() => window.location.reload());
        window.addEventListener('hashchange', refreshLoginButton);
        
        firebase.auth().onAuthStateChanged(async (user) => {
            logout.hidden = !user;
            refreshLoginButton();
            
            const isOwner = !!user && await this.checkOwner(user);
            Storage.isOwner = isOwner;
            document.body.classList.toggle('is-owner', isOwner);
            App.syncTopOffset();
            UI.syncSidebar();
            if (isOwner) await Storage.offerLegacyUpload();
        });
    },
    
    async submitLogin(e) {
        e.preventDefault();
        
        const submit = document.getElementById('btn-login-submit');
        const error = document.getElementById('login-error');
        const email = document.getElementById('input-login-email').value.trim();
        const password = document.getElementById('input-login-password').value;
        
        submit.disabled = true;
        error.hidden = true;
        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            UI.hideModal('modal-login');
        } catch (err) {
            console.error('Sign-in failed.', err.code);
            error.innerText = this.loginErrorMessage(err.code);
            error.hidden = false;
        } finally {
            submit.disabled = false;
        }
    },
    
    loginErrorMessage(code) {
        if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
        if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
        if (code === 'auth/operation-not-allowed') return 'Email sign-in is not enabled for this project.';
        return 'Incorrect email or password.';
    },
    
    // Only the owner may read this path, so a successful read proves ownership
    async checkOwner(user) {
        try {
            await Storage.db().doc('private/owner-check').get();
            return true;
        } catch (err) {
            console.error('Owner check failed.', err);
            alert(`This account is not the gallery owner.\nUser ID: ${user.uid}`);
            return false;
        }
    }
};

// Don't lose edits that are still waiting to be saved
window.addEventListener('beforeunload', (e) => {
    if (Storage.dirty) e.preventDefault();
});

// === BOOTSTRAP INITIALIZATION ===
window.onload = () => {
    App.init();
};
