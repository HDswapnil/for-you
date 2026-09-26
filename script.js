(() => {
	'use strict';

	const CONFIG = Object.freeze({
		particleCount: 15000,
		particleSize: 1.25,
		formationDuration: 5800,
		maxFormationDelay: 1250,
		portraitHold: 1300,
		edgeGain: 4.1,
		edgeSamplingWeight: 1.9,
		luminanceSamplingWeight: 0.95,
		ambientCount: 34,
		maxPixelRatio: 2,
	});

	const PHASE_THREE = Object.freeze({
		colorPhotoHold: 1300,
		photoMoveDuration: 1500,
		letterReveal: Object.freeze({
			panelSettle: 900,
			openingDuration: 900,
			openingPause: 800,
		signoffPause: 1200,
		signoffDuration: 850,
		signaturePause: 500,
		}),
		shayari: Object.freeze({
			wordInterval: 108,
			timingVariation: 20,
			climaxWordInterval: 142,
			wordDuration: 760,
			climaxWordDuration: 1020,
			stanzas: [
				[
					{ text: 'Meri zindagi ke kaash ho tum,' },
					{ text: 'Meri aakhri aas ho tum.', pauseAfter: 850 },
				],
				[
					{ text: 'Tumse milkar laga,' },
					{ text: 'jaise khuda se mila hoon—' },
					{ text: 'meri khud se judi har talaash ho tum.', pauseAfter: 1350 },
				],
				[
					{ text: 'Meri zindagi ke kaash ho tum,' },
					{ text: 'Meri aakhri aas ho tum.', pauseAfter: 850 },
				],
				[
					{ text: 'Agar mohabbat ko koi naam dena ho,' },
					{ text: 'toh bas itna kahunga—', pauseAfter: 1950 },
				],
				[
					{ text: 'Meri mohabbat ka ehsaas ho tum.', climax: true },
				],
			],
		}),
	});

	const canvas = document.querySelector('#particle-canvas');
	const photograph = document.querySelector('#photograph');
	const scene = document.querySelector('.scene');
	const poetry = document.querySelector('#poetry');
	const poetryContent = document.querySelector('#poetry-content');
	const context = canvas.getContext('2d', { alpha: true });
	const image = new Image();
	const particlesByTone = [[], [], []];
	let ambientParticles = [];
	let width = 0;
	let height = 0;
	let pixelRatio = 1;
	let startedAt = 0;
	let animationFrame = 0;
	let photoSettledAt = 0;
	let compositionStartedAt = 0;
	let photographDecoded = false;

	function randomBetween(min, max) {
		return min + Math.random() * (max - min);
	}

	function buildShayari() {
		const content = document.createDocumentFragment();
		let wordCount = 0;
		let revealDelay = 0;

		for (const stanza of PHASE_THREE.shayari.stanzas) {
			const stanzaElement = document.createElement('p');
			stanzaElement.className = 'poem-stanza';

			for (const line of stanza) {
				const lineElement = document.createElement('span');
				lineElement.className = line.climax ? 'poem-line poem-line--climax' : 'poem-line';
				const words = line.text.split(' ');

				words.forEach((text, index) => {
					if (wordCount > 0) {
						const variation = ((wordCount * 7) % 9 - 4) * (PHASE_THREE.shayari.timingVariation / 4);
					const interval = line.climax
							? PHASE_THREE.shayari.climaxWordInterval
							: PHASE_THREE.shayari.wordInterval;
					revealDelay += interval + variation;
					}

					const word = document.createElement('span');
					word.className = line.climax ? 'poem-word poem-word--climax' : 'poem-word';
					word.textContent = text;
					word.style.setProperty('--word-delay', `${revealDelay}ms`);
					word.style.setProperty('--word-duration', `${line.climax
						? PHASE_THREE.shayari.climaxWordDuration
						: PHASE_THREE.shayari.wordDuration}ms`);
					lineElement.append(word);

					if (index < words.length - 1) {
						lineElement.append(document.createTextNode(' '));
					}
					wordCount += 1;
				});

				stanzaElement.append(lineElement);
				if (line.pauseAfter) {
					revealDelay += line.pauseAfter;
				}
			}

			content.append(stanzaElement);
		}

		poetryContent.replaceChildren(content);
		const poemStartDelay = PHASE_THREE.letterReveal.panelSettle
			+ PHASE_THREE.letterReveal.openingDuration
			+ PHASE_THREE.letterReveal.openingPause;
		const signoffDelay = poemStartDelay + revealDelay
			+ PHASE_THREE.shayari.climaxWordDuration
			+ PHASE_THREE.letterReveal.signoffPause;
		poetry.style.setProperty('--poem-start-delay', `${poemStartDelay}ms`);
		poetry.style.setProperty('--letter-signoff-delay', `${signoffDelay}ms`);
		poetry.style.setProperty('--letter-signature-delay', `${signoffDelay
			+ PHASE_THREE.letterReveal.signoffDuration
			+ PHASE_THREE.letterReveal.signaturePause}ms`);
	}

	function makeGrainTexture() {
		const grainCanvas = document.createElement('canvas');
		const grainContext = grainCanvas.getContext('2d');
		const size = 128;
		grainCanvas.width = size;
		grainCanvas.height = size;
		const grain = grainContext.createImageData(size, size);

		for (let index = 0; index < grain.data.length; index += 4) {
			const value = Math.random() > 0.5 ? 255 : 0;
			grain.data[index] = value;
			grain.data[index + 1] = value;
			grain.data[index + 2] = value;
			grain.data[index + 3] = randomBetween(16, 46);
		}

		grainContext.putImageData(grain, 0, 0);
		document.documentElement.style.setProperty('--grain-texture', `url("${grainCanvas.toDataURL()}")`);
	}

	function buildAmbientParticles() {
		ambientParticles = Array.from({ length: CONFIG.ambientCount }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			radius: randomBetween(0.35, 1.05),
			alpha: randomBetween(0.08, 0.23),
			phase: Math.random() * Math.PI * 2,
			drift: randomBetween(0.12, 0.48),
		}));
	}

	function getImageTransform() {
		const availableWidth = width * 0.84;
		const availableHeight = height * 0.8;
		const scale = Math.min(
			availableWidth / image.naturalWidth,
			availableHeight / image.naturalHeight,
		);
		const renderedWidth = image.naturalWidth * scale;
		const renderedHeight = image.naturalHeight * scale;

		return {
			scale,
			renderedWidth,
			renderedHeight,
			offsetX: (width - renderedWidth) / 2,
			offsetY: (height - renderedHeight) / 2,
		};
	}

	function buildPhotoParticles() {
		scene.dataset.phase = 'particles';
		poetry.setAttribute('aria-hidden', 'true');
		photoSettledAt = 0;
		compositionStartedAt = 0;
		particlesByTone.forEach((particles) => { particles.length = 0; });

		const imageTransform = getImageTransform();
		photograph.style.left = `${imageTransform.offsetX}px`;
		photograph.style.top = `${imageTransform.offsetY}px`;
		photograph.style.width = `${imageTransform.renderedWidth}px`;
		photograph.style.height = `${imageTransform.renderedHeight}px`;
		const sampleWidth = Math.max(1, Math.round(imageTransform.renderedWidth));
		const sampleHeight = Math.max(1, Math.round(imageTransform.renderedHeight));
		const sampleCanvas = document.createElement('canvas');
		const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
		sampleCanvas.width = sampleWidth;
		sampleCanvas.height = sampleHeight;
		sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);

		const imageData = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
		const pixelCount = sampleWidth * sampleHeight;
		const luminanceMap = new Float32Array(pixelCount);
		const edgeMap = new Float32Array(pixelCount);
		const cumulativeWeights = new Float64Array(pixelCount);

		for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
			const colorIndex = pixelIndex * 4;
			luminanceMap[pixelIndex] = (
				imageData[colorIndex] * 0.2126
				+ imageData[colorIndex + 1] * 0.7152
				+ imageData[colorIndex + 2] * 0.0722
			) / 255;
		}

		let totalWeight = 0;
		for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
			const x = pixelIndex % sampleWidth;
			const y = Math.floor(pixelIndex / sampleWidth);
			const luminance = luminanceMap[pixelIndex];
			const leftX = Math.max(0, x - 1);
			const rightX = Math.min(sampleWidth - 1, x + 1);
			const topY = Math.max(0, y - 1);
			const bottomY = Math.min(sampleHeight - 1, y + 1);
			const topLeft = luminanceMap[topY * sampleWidth + leftX];
			const top = luminanceMap[topY * sampleWidth + x];
			const topRight = luminanceMap[topY * sampleWidth + rightX];
			const left = luminanceMap[y * sampleWidth + leftX];
			const right = luminanceMap[y * sampleWidth + rightX];
			const bottomLeft = luminanceMap[bottomY * sampleWidth + leftX];
			const bottom = luminanceMap[bottomY * sampleWidth + x];
			const bottomRight = luminanceMap[bottomY * sampleWidth + rightX];
			const gradientX = (-topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight) / 8;
			const gradientY = (-topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight) / 8;
			const edgeStrength = Math.min(1, Math.hypot(gradientX, gradientY) * CONFIG.edgeGain);
			edgeMap[pixelIndex] = edgeStrength;
			const samplingWeight = 0.025
				+ Math.pow(luminance, 1.2) * CONFIG.luminanceSamplingWeight
				+ Math.pow(edgeStrength, 1.15) * CONFIG.edgeSamplingWeight;
			totalWeight += samplingWeight;
			cumulativeWeights[pixelIndex] = totalWeight;
		}

		const spread = Math.max(width, height) * 0.58;
		for (let sampleIndex = 0; sampleIndex < CONFIG.particleCount; sampleIndex += 1) {
			const targetWeight = ((sampleIndex + Math.random()) / CONFIG.particleCount) * totalWeight;
			let low = 0;
			let high = pixelCount - 1;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (cumulativeWeights[middle] < targetWeight) {
					low = middle + 1;
				} else {
					high = middle;
				}
			}

			const sourceX = low % sampleWidth;
			const sourceY = Math.floor(low / sampleWidth);
			const luminance = luminanceMap[low];
			const importance = Math.pow(edgeMap[low], 0.9);
			const visualTone = luminance * 0.72 + importance * 0.28;
			const tone = visualTone > 0.68 ? 0 : visualTone > 0.31 ? 1 : 2;
			const originAngle = Math.random() * Math.PI * 2;
			const originRadius = Math.sqrt(Math.random()) * spread;

			particlesByTone[tone].push({
				x: imageTransform.offsetX
					+ (sourceX + Math.random()) * image.naturalWidth / sampleWidth * imageTransform.scale,
				y: imageTransform.offsetY
					+ (sourceY + Math.random()) * image.naturalHeight / sampleHeight * imageTransform.scale,
				originX: width / 2 + Math.cos(originAngle) * originRadius,
				originY: height / 2 + Math.sin(originAngle) * originRadius,
				size: CONFIG.particleSize * randomBetween(0.72, 1.18) * (0.75 + luminance * 0.34 + importance * 0.32),
				alpha: (0.075 + Math.pow(luminance, 0.85) * 0.34 + importance * 0.32) * randomBetween(0.82, 1.08),
				delay: Math.random() * CONFIG.maxFormationDelay,
				duration: CONFIG.formationDuration * randomBetween(0.82, 1.08),
				phase: Math.random() * Math.PI * 2,
			});
		}

		startedAt = performance.now();
	}

	function resize() {
		width = scene.clientWidth;
		height = scene.clientHeight;
		pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
		canvas.width = Math.round(width * pixelRatio);
		canvas.height = Math.round(height * pixelRatio);
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		buildAmbientParticles();

		if (image.complete && image.naturalWidth > 0) {
			buildPhotoParticles();
		}
	}

	function drawAmbient(elapsedSeconds) {
		context.fillStyle = 'rgb(190 190 190)';

		for (const particle of ambientParticles) {
			const drift = Math.sin(elapsedSeconds * particle.drift + particle.phase);
			context.globalAlpha = particle.alpha;
			context.beginPath();
			context.arc(particle.x + drift * 4, particle.y + drift * 2, particle.radius, 0, Math.PI * 2);
			context.fill();
		}
	}

	function drawPhotoParticles(elapsed) {
		const tones = ['#fff4e4', '#ddd9d2', '#aaa8a4'];

		for (let tone = 0; tone < particlesByTone.length; tone += 1) {
			context.fillStyle = tones[tone];

			for (const particle of particlesByTone[tone]) {
				const rawProgress = Math.max(0, Math.min(1, (elapsed - particle.delay) / particle.duration));
				const progress = 1 - Math.pow(1 - rawProgress, 3);
				const drift = Math.sin(elapsed * 0.0011 + particle.phase) * (1 - progress) * 1.7;
				const x = particle.originX + (particle.x - particle.originX) * progress + drift;
				const y = particle.originY + (particle.y - particle.originY) * progress;

				context.globalAlpha = particle.alpha;
				const size = particle.size;
				context.fillRect(x - size / 2, y - size / 2, size, size);
			}
		}
	}

	function render(now) {
		const elapsed = now - startedAt;
		const formationEnd = CONFIG.formationDuration * 1.08 + CONFIG.maxFormationDelay;
		if (scene.dataset.phase === 'particles' && elapsed >= formationEnd + CONFIG.portraitHold) {
			scene.dataset.phase = 'photo-reveal';
		}
		if (scene.dataset.phase === 'photo-reveal' && photographDecoded && photoSettledAt > 0
			&& now - photoSettledAt >= PHASE_THREE.colorPhotoHold) {
			scene.dataset.phase = 'composition';
			compositionStartedAt = now;
		}
		if (scene.dataset.phase === 'composition'
			&& now - compositionStartedAt >= PHASE_THREE.photoMoveDuration) {
			scene.dataset.phase = 'shayari';
			poetry.setAttribute('aria-hidden', 'false');
		}
		context.globalAlpha = 1;
		context.clearRect(0, 0, width, height);
		drawAmbient(elapsed / 1000);
		drawPhotoParticles(elapsed);
		animationFrame = window.requestAnimationFrame(render);
	}

	function createScene() {
		makeGrainTexture();
		buildShayari();
		const photographDecode = typeof photograph.decode === 'function'
			? photograph.decode()
			: Promise.resolve();
		photographDecode.then(() => {
			photographDecoded = photograph.complete && photograph.naturalWidth > 0;
		}).catch(() => {
			photographDecoded = photograph.complete && photograph.naturalWidth > 0;
		});
		photograph.addEventListener('transitionend', (event) => {
			if (event.propertyName === 'opacity' && scene.dataset.phase === 'photo-reveal') {
				photoSettledAt = performance.now();
			}
		});
		resize();
		image.onload = () => {
			buildPhotoParticles();
			if (!animationFrame) {
				animationFrame = window.requestAnimationFrame(render);
			}
		};
		image.onerror = () => {
			document.body.dataset.imageError = 'true';
		};
		image.src = 'assets/us_clean.jpg';
	}

	window.addEventListener('resize', resize, { passive: true });
	createScene();
})();
