/* Mini-jeu Canvas — version avec modes normal et infini
   - Deux modes de jeu : normal (10 rounds) et infini (jusqu'à échec)
   - Boules cachées au début, apparaissent au lancement
   - Positions aléatoires des boules à chaque round
   - Délai aléatoire avant l'apparition de l'image
   - Compteur de réussites et écran de victoire
*/

const $ = s => document.querySelector(s);
const menu = $("#menu");
const normalModeBtn = $("#normalModeBtn");
const infiniteModeBtn = $("#infiniteModeBtn");
const countdown = $("#countdown");
const countText = $("#countText");
const hud = $("#hud");
const timerEl = $("#timer");
const counterEl = $("#counter");
const canvas = $("#gameCanvas");
const ctx = canvas.getContext("2d");
const cueImage = $("#cueImage");
const result = $("#result");
const resultText = $("#resultText");
const retryBtn = $("#retryBtn");
const restartBtn = $("#restartBtn");
const victory = $("#victory");
const victoryText = $("#victoryText");
const victoryStats = $("#victoryStats");
const victoryRetryBtn = $("#victoryRetryBtn");
const victoryMenuBtn = $("#victoryMenuBtn");
const easyModeCheckbox = $("#easyModeCheckbox");

// Vérifier que tous les éléments DOM sont trouvés
console.log("Éléments DOM trouvés:", {
  menu, normalModeBtn, infiniteModeBtn, countdown, countText, hud, timerEl, counterEl,
  canvas, cueImage, result, resultText, retryBtn, restartBtn, victory, victoryText, victoryStats, easyModeCheckbox
});

// ------- Canvas sizing -------
let W = 0, H = 0, center = {x:0, y:0};
function resize(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  center.x = W/2; center.y = H/2;
}
window.addEventListener("resize", resize);
resize();

// ------- Timing & game state -------
let running = false;
let startTime = 0;
let rafId = null;
let clicked = false;
let gameMode = null; // 'normal' ou 'infinite'
let successCount = 0;
let totalTime = 0;
let roundStartTime = 0;
let imageTimeout = null;
let ballsVisible = false;

function now(){ return performance.now(); }
function fmt(ms){ return (ms/1000).toFixed(2) + " s"; }

// ------- Orbit / cluster -------
const orbitRadius = () => Math.min(W, H) * 0.24;      // distance du centre
const orbRadius   = () => Math.max(18, Math.min(W,H)*0.035); // taille chaque orbe

// vitesse angulaire : ~ 1 tour en 45 s (lent)
const REVOLUTION_SECONDS = 45;
const ANGULAR_SPEED = (Math.PI*2)/(REVOLUTION_SECONDS*1000);

// on veut les trois orbes COTE A COTE : offsets minimaux autour d'un angle central (ici, 0 rad = à droite)
const CLUSTER_OFFSETS = [-0.3, 0, +0.3]; // écart angulaire minimal entre orbes
let baseAngle = 0;                          // angle commun (orbite)
let clusterBias = 0;                        // pour démarrer côté droit

// ------- Cible & images -------
const TARGET_FOR = { droite: 0, gauche: 2 }; // cercle #1 => index 0; cercle #3 => index 2
let currentCue = null;
const images = {
  droite: "assets/images/droite.png",
  gauche: "assets/images/gauche.png"
};

// ------- Dessin : "ourcin coupé en deux" avec piques dans la surface -------
function drawSpikyOrb(x, y, r, orbNumber = null){
  ctx.save();
  ctx.translate(x, y);

  // Créer un effet de demi-sphère avec gradient radial
  const sphereGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  sphereGradient.addColorStop(0, "#1a1a2e"); // Centre sombre
  sphereGradient.addColorStop(0.6, "#16213e"); // Milieu
  sphereGradient.addColorStop(1, "#0f3460"); // Bord plus clair

  // Dessiner la base de la demi-sphère
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = sphereGradient;
  ctx.fill();

  // Ajouter un effet de profondeur avec un gradient plus sombre au centre
  const centerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
  centerGradient.addColorStop(0, "#000000"); // Centre très sombre
  centerGradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = centerGradient;
  ctx.fill();

  // Dessiner les piques qui émergent de la surface (comme un oursin)
  const SPIKES = 16;
  for(let i = 0; i < SPIKES; i++){
    const angle = (i / SPIKES) * Math.PI * 2;
    
    // Fonction pseudo-aléatoire basée sur l'angle pour des piques cohérentes
    const pseudoRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    
    // Position de base de la pique (dans le cercle, pas sur le bord)
    const spikeBaseRadius = r * (0.3 + pseudoRandom(angle * 7) * 0.4); // Entre 30% et 70% du rayon
    const baseX = Math.cos(angle) * spikeBaseRadius;
    const baseY = Math.sin(angle) * spikeBaseRadius;
    
    // Longueur de la pique (variable pour plus de réalisme)
    const spikeLength = r * (0.4 + pseudoRandom(angle * 11) * 0.3);
    const tipX = baseX + Math.cos(angle) * spikeLength;
    const tipY = baseY + Math.sin(angle) * spikeLength;
    
    // Largeur de la pique
    const spikeWidth = r * 0.08;
    const perpAngle = angle + Math.PI / 2;
    const widthX = Math.cos(perpAngle) * spikeWidth;
    const widthY = Math.sin(perpAngle) * spikeWidth;
    
    // Dessiner la pique
    ctx.beginPath();
    ctx.moveTo(baseX - widthX, baseY - widthY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(baseX + widthX, baseY + widthY);
    ctx.closePath();
    
    // Gradient pour la pique (violet vers bleu)
    const spikeGradient = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
    spikeGradient.addColorStop(0, "#8B5CF6"); // Violet à la base
    spikeGradient.addColorStop(0.7, "#3B82F6"); // Bleu au milieu
    spikeGradient.addColorStop(1, "#60A5FA"); // Bleu clair au bout
    
    ctx.fillStyle = spikeGradient;
    ctx.fill();
    
    // Contour lumineux pour la pique
    ctx.strokeStyle = "#93C5FD";
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.stroke();
  }

  // Ajouter un effet de glow externe subtil
  const glowGradient = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.3);
  glowGradient.addColorStop(0, "rgba(139, 92, 246, 0.1)");
  glowGradient.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();

  // MODE FACILE : Ajouter le numéro de la boule si activé
  if(orbNumber !== null && easyModeCheckbox.checked){
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${r * 0.4}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeText(orbNumber.toString(), 0, 0);
    ctx.fillText(orbNumber.toString(), 0, 0);
  }

  ctx.restore();
}

// calcule positions des 3 orbes côte à côte
function getOrbPositions(){
  const R = orbitRadius();
  const positions = [];
  for(let i=0;i<3;i++){
    const a = baseAngle + clusterBias + CLUSTER_OFFSETS[i];
    positions.push({
      x: center.x + Math.cos(a)*R,
      y: center.y + Math.sin(a)*R
    });
  }
  return positions;
}

// ------- Boucle d'animation -------
let last = 0;
function loop(t){
  rafId = requestAnimationFrame(loop);
  if(!last) last = t;
  const dt = t - last; last = t;

  baseAngle += ANGULAR_SPEED * dt;

  ctx.clearRect(0,0,W,H);

  // Ne dessiner les boules que si elles sont visibles
  if(ballsVisible){
    const r = orbRadius();
    const pts = getOrbPositions();
    pts.forEach((p, index) => drawSpikyOrb(p.x, p.y, r, index + 1)); // +1 pour avoir 1, 2, 3
  }

  if(running){
    timerEl.textContent = fmt(now() - startTime);
  }
}

// ------- Clic détecter quel orbe -------
canvas.addEventListener("pointerdown", e=>{
  if(!running || clicked) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const pts = getOrbPositions();
  const r = orbRadius() * 1.2; // Zone de clic raisonnable
  
  let hit = -1;
  for(let i=0;i<pts.length;i++){
    const dx = x - pts[i].x, dy = y - pts[i].y;
    if(dx*dx + dy*dy <= r*r) { 
      hit = i; 
      break; 
    }
  }
  
  if(hit === -1) return;

  clicked = true;
  const roundTime = now() - roundStartTime;
  const targetIndex = TARGET_FOR[currentCue];
  const success = hit === targetIndex;
  
  
  if(success){
    handleSuccess(roundTime);
  } else {
    handleFailure();
  }
});

// ------- Flow UI -------
normalModeBtn.addEventListener("click", () => startGame('normal'));
infiniteModeBtn.addEventListener("click", () => startGame('infinite'));
retryBtn.addEventListener("click", resetToMenu);
restartBtn.addEventListener("click", restartGame);
victoryRetryBtn.addEventListener("click", () => startGame(gameMode));
victoryMenuBtn.addEventListener("click", resetToMenu);

function startGame(mode){
  gameMode = mode;
  successCount = 0;
  totalTime = 0;
  
  // Réinitialiser l'interface
  menu.style.display = "none";
  result.style.display = "none";
  victory.style.display = "none";
  countdown.style.display = "flex";
  hud.style.display = "none";
  cueImage.style.display = "none";
  clicked = false;
  ballsVisible = false;
  
  // Mettre à jour le compteur selon le mode
  if(mode === 'normal'){
    counterEl.textContent = "0/10";
  } else {
    counterEl.textContent = "0";
  }
  
  // Remettre le timer à 0
  timerEl.textContent = "0.00 s";

  const steps = ["3","2","1","GO!"];
  let i = 0;

  const tick = ()=>{
    countText.textContent = steps[i];
    countText.style.opacity = "1";
    countText.style.transform = "scale(1)";
    setTimeout(()=>{
      countText.style.transition = "opacity .28s ease, transform .28s ease";
      countText.style.opacity = "0";
      countText.style.transform = "scale(0.8)";
    }, 520);

    i++;
    if(i < steps.length){
      setTimeout(tick, 800);
    }else{
      setTimeout(()=>{
        countdown.style.display = "none";
        startRound();
      }, 820);
    }
  };

  countText.style.transition = "none";
  countText.style.opacity = "0";
  countText.style.transform = "scale(0.8)";
  setTimeout(tick, 60);
}

function startRound(){
  // Position aléatoire des boules
  clusterBias = Math.random() * Math.PI * 2;
  
  
  // Afficher les boules
  ballsVisible = true;
  
  // Afficher le HUD
  hud.style.display = "flex";
  
  // Démarrer l'animation
  if(!rafId) rafId = requestAnimationFrame(loop);
  
  // Démarrer le timer du round
  roundStartTime = now();
  if(successCount === 0){
    startTime = now(); // Premier round
  }
  
  // Délai aléatoire avant l'apparition de l'image (0.5 à 1.5 secondes)
  const delay = 500 + Math.random() * 1000;
  imageTimeout = setTimeout(() => {
    if(!clicked){
      currentCue = Math.random() < 0.5 ? "droite" : "gauche";
      cueImage.src = images[currentCue];
      cueImage.style.display = "block";
      running = true;
    }
  }, delay);
}

function handleSuccess(roundTime){
  successCount++;
  totalTime += roundTime;
  
  // Arrêter le timer
  running = false;
  cueImage.style.display = "none";
  
  // Mettre à jour le compteur
  if(gameMode === 'normal'){
    counterEl.textContent = `${successCount}/10`;
  } else {
    counterEl.textContent = successCount.toString();
  }
  
  // Mettre à jour le timer selon le mode
  if(gameMode === 'normal'){
    timerEl.textContent = fmt(totalTime);
  } else {
    const avgTime = totalTime / successCount;
    timerEl.textContent = fmt(avgTime);
  }
  
  // Vérifier si le jeu est terminé
  if(gameMode === 'normal' && successCount >= 10){
    showVictory();
  } else {
    // Continuer avec le round suivant
    clicked = false;
    setTimeout(() => {
      startRound();
    }, 1000); // Pause d'1 seconde entre les rounds
  }
}

function handleFailure(){
  running = false;
  cueImage.style.display = "none";
  
  if(gameMode === 'normal'){
    showResult(false, totalTime);
  } else {
    const avgTime = successCount > 0 ? totalTime / successCount : 0;
    showInfiniteResult(successCount, avgTime);
  }
}

function showVictory(){
  victory.classList.remove("hidden");
  victory.style.display = "flex";
  victoryText.textContent = "Victoire !";
  victoryStats.textContent = `Temps total : ${fmt(totalTime)}`;
}

function showInfiniteResult(count, avgTime){
  result.classList.remove("hidden");
  result.style.display = "flex";
  resultText.textContent = `Vous avez réussi ${count} fois avec un temps moyen de ${fmt(avgTime)}`;
}

function showResult(success, elapsedMs){
  running = false;
  cueImage.style.display = "none";
  hud.style.display = "none";
  
  const message = success ? `Bravo ! Temps : ${fmt(elapsedMs)}` : `C'est le wipe !`;
  resultText.textContent = message;
  
  // Retirer la classe 'hidden' et forcer l'affichage
  result.classList.remove("hidden");
  result.style.display = "flex";
}

function resetToMenu(){
  // Nettoyer les timeouts
  if(imageTimeout){
    clearTimeout(imageTimeout);
    imageTimeout = null;
  }
  
  // Réinitialiser l'état
  result.classList.add("hidden");
  result.style.display = "none";
  victory.classList.add("hidden");
  victory.style.display = "none";
  menu.style.display = "flex";
  hud.style.display = "none";
  cueImage.style.display = "none";
  clicked = false;
  running = false;
  ballsVisible = false;
  gameMode = null;
  successCount = 0;
  totalTime = 0;
  
  if(!rafId) rafId = requestAnimationFrame(loop);
}

function restartGame(){
  // Nettoyer les timeouts
  if(imageTimeout){
    clearTimeout(imageTimeout);
    imageTimeout = null;
  }
  
  // Réinitialiser l'état
  result.classList.add("hidden");
  result.style.display = "none";
  victory.classList.add("hidden");
  victory.style.display = "none";
  clicked = false;
  running = false;
  ballsVisible = false;
  successCount = 0;
  totalTime = 0;
  
  // Relancer le jeu avec le même mode
  if(gameMode){
    startGame(gameMode);
  }
}

// ------- Boot -------
rafId = requestAnimationFrame(loop);