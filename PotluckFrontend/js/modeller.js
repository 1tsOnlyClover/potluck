import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.autoClear = false;
renderer.domElement.setAttribute( 'aria-label', '3D asset preview' );
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.enableZoom = true;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.mouseButtons.LEFT = null;
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const ambientLight = new THREE.HemisphereLight( 0xffffff, 0x4a4035, 1.1 );
const keyLight = new THREE.DirectionalLight( 0xffffff, 2 );
keyLight.position.set( -3, 5, 4 );
keyLight.castShadow = true;
keyLight.shadow.mapSize.set( 1024, 1024 );
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 3;
scene.add( ambientLight, keyLight );

const geometry = new THREE.SphereGeometry( 1, 128, 128, 128 );
const material = createCavityMaterial( { color: 0xdcdcdc } );
const model = new THREE.Mesh( geometry, material );
model.castShadow = true;
model.receiveShadow = true;
scene.add( model );

camera.position.z = 5;
controls.update();

const titleButton = document.querySelector( '#asset-title' );
const renameForm = document.querySelector( '#rename-form' );
const nameInput = document.querySelector( '#asset-name' );
const saveButton = document.querySelector( '#save-asset' );
const loadButton = document.querySelector( '#load-asset' );
const status = document.querySelector( '#asset-status' );
const loadDialog = document.querySelector( '#load-asset-dialog' );
const loadForm = document.querySelector( '#load-asset-form' );
const savedAssetSelect = document.querySelector( '#saved-asset-select' );
const sculptBrushButton = document.querySelector( '#sculpt-brush' );
const boreBrushButton = document.querySelector( '#bore-brush' );
const brushSizeSlider = document.querySelector( '#brush-size-slider' );
const brushSizeDisplay = document.querySelector( '#brush-size-display' );
const sculptStrengthSlider = document.querySelector( '#sculpt-strength-slider' );
const sculptStrengthDisplay = document.querySelector( '#sculpt-strength-display' );
const storageKey = `potluck.assets.${encodeURIComponent( document.body.dataset.userName )}`;
let assetName = titleButton.textContent.trim();
let assetId = null;

function addCavityShading( material ) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float cavity = clamp(
        ( dot( dFdx( normal ), dFdx( vViewPosition ) ) +
          dot( dFdy( normal ), dFdy( vViewPosition ) ) ) * 1200.0,
        0.0,
        0.22
      );
      diffuseColor.rgb *= 1.0 - cavity;`,
    );
  };
  material.customProgramCacheKey = () => 'potluck-cavity-shading-v1';
  material.needsUpdate = true;
  return material;
}

function createCavityMaterial( options ) {
  return addCavityShading( new THREE.MeshStandardMaterial( options ) );
}

function applyCavityShading( object ) {
  if ( !object.isMesh ) return;

  const materials = Array.isArray( object.material ) ? object.material : [ object.material ];
  const shadedMaterials = materials.map( sourceMaterial => {
    if ( sourceMaterial.isMeshStandardMaterial ) return addCavityShading( sourceMaterial );

    const standardMaterial = createCavityMaterial( {
      color: sourceMaterial.color,
      map: sourceMaterial.map,
      alphaMap: sourceMaterial.alphaMap,
      side: sourceMaterial.side,
      vertexColors: sourceMaterial.vertexColors,
      transparent: sourceMaterial.transparent,
      opacity: sourceMaterial.opacity,
      roughness: 0.85,
    } );
    sourceMaterial.dispose();
    return standardMaterial;
  } );

  object.material = Array.isArray( object.material ) ? shadedMaterials : shadedMaterials[ 0 ];
  object.castShadow = true;
  object.receiveShadow = true;
}

function readSavedAssets() {
  const stored = localStorage.getItem( storageKey );
  if ( !stored ) return [];

  const assets = JSON.parse( stored );
  if ( !Array.isArray( assets ) || assets.some( asset => !asset.id || !asset.name || !asset.scene ) ) {
    throw new Error( 'Saved assets data has an invalid format.' );
  }
  return assets;
}

function setStatus( message ) {
  status.textContent = message;
}

titleButton.addEventListener( 'click', () => {
  nameInput.value = assetName;
  titleButton.hidden = true;
  renameForm.hidden = false;
  nameInput.focus();
  nameInput.select();
} );

document.querySelector( '#cancel-rename' ).addEventListener( 'click', () => {
  renameForm.hidden = true;
  titleButton.hidden = false;
} );

renameForm.addEventListener( 'submit', event => {
  event.preventDefault();
  const nextName = nameInput.value.trim();
  if ( !nextName ) {
    setStatus( 'Enter a name for this asset.' );
    nameInput.focus();
    return;
  }

  assetName = nextName;
  titleButton.textContent = assetName;
  titleButton.hidden = false;
  renameForm.hidden = true;
  setStatus( 'Asset renamed. Save to keep the new name.' );
} );

saveButton.addEventListener( 'click', () => {
  try {
    const assets = readSavedAssets();
    assetId ||= globalThis.crypto.randomUUID();

    const savedAsset = {
      id: assetId,
      name: assetName,
      scene: scene.toJSON(),
      updatedAt: new Date().toISOString(),
    };
    const existingIndex = assets.findIndex( asset => asset.id === assetId );
    if ( existingIndex === -1 ) assets.push( savedAsset );
    else assets[ existingIndex ] = savedAsset;

    localStorage.setItem( storageKey, JSON.stringify( assets ) );
    setStatus( `"${assetName}" saved in this browser.` );
  } catch ( error ) {
    console.error( 'Unable to save asset:', error );
    setStatus( 'Unable to save this asset in your browser storage.' );
  }
} );

loadButton.addEventListener( 'click', () => {
  try {
    const assets = readSavedAssets();
    if ( !assets.length ) {
      setStatus( 'No saved assets yet. Save an asset first.' );
      return;
    }

    savedAssetSelect.replaceChildren( ...assets.map( asset => {
      const option = document.createElement( 'option' );
      option.value = asset.id;
      option.textContent = asset.name;
      return option;
    } ) );
    loadDialog.showModal();
  } catch ( error ) {
    console.error( 'Unable to read saved assets:', error );
    setStatus( 'Unable to read saved assets from this browser.' );
  }
} );

document.querySelector( '#cancel-load' ).addEventListener( 'click', () => {
  loadDialog.close();
} );

loadForm.addEventListener( 'submit', event => {
  event.preventDefault();
  try {
    const selectedAsset = readSavedAssets().find( asset => asset.id === savedAssetSelect.value );
    if ( !selectedAsset ) {
      loadDialog.close();
      setStatus( 'That saved asset could not be found.' );
      return;
    }

    const loadedScene = new THREE.ObjectLoader().parse( selectedAsset.scene );
    if ( !loadedScene.children.some( child => child.isLight ) ) {
      loadedScene.add( ambientLight, keyLight );
    }
    loadedScene.traverse( applyCavityShading );
    scene.clear();
    for ( const child of [ ...loadedScene.children ] ) scene.add( child );

    assetId = selectedAsset.id;
    assetName = selectedAsset.name;
    titleButton.textContent = assetName;
    loadDialog.close();
    setStatus( `"${assetName}" loaded.` );
  } catch ( error ) {
    console.error( 'Unable to load asset:', error );
    loadDialog.close();
    setStatus( 'Unable to load that asset. Its saved data may be damaged.' );
  }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let brushRadius = Number( brushSizeSlider.value );
let sculptStrength = Number( sculptStrengthSlider.value );
let sculpting = false;
let lastStrokePoint = null;
let brushMode = 'sculpt';
const brushScene = new THREE.Scene();
const brushIndicator = new THREE.Mesh(
  new THREE.RingGeometry( brushRadius * 0.88, brushRadius, 48 ),
  new THREE.MeshBasicMaterial( {
    color: 0xff8c00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  } ),
);
brushIndicator.visible = false;
brushScene.add( brushIndicator );

brushSizeSlider.addEventListener( 'input', () => {
  brushRadius = Number( brushSizeSlider.value );
  brushSizeDisplay.value = brushRadius.toFixed( 2 );
  brushIndicator.geometry.dispose();
  brushIndicator.geometry = new THREE.RingGeometry( brushRadius * 0.88, brushRadius, 48 );
} );

sculptStrengthSlider.addEventListener( 'input', () => {
  sculptStrength = Number( sculptStrengthSlider.value );
  sculptStrengthDisplay.value = sculptStrength.toFixed( 2 );
} );

function getIntersection( event ) {
  return getIntersectionAt( event.clientX, event.clientY );
}

function getIntersectionAt( clientX, clientY, target = scene ) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ( ( clientX - bounds.left ) / bounds.width ) * 2 - 1;
  pointer.y = -( ( clientY - bounds.top ) / bounds.height ) * 2 + 1;
  raycaster.setFromCamera( pointer, camera );

  const intersections = target === scene
    ? raycaster.intersectObjects( scene.children, true )
    : raycaster.intersectObject( target, true );
  return intersections
    .find( intersection => intersection.object.isMesh && intersection.object.geometry?.getAttribute( 'position' ) );
}

function getStrokePoint( intersection, clientX, clientY ) {
  return {
    clientX,
    clientY,
    mesh: intersection.object,
    point: intersection.object.worldToLocal( intersection.point.clone() ),
    normal: intersection.face.normal.clone(),
  };
}

function getStrokeMovement( event, intersection ) {
  const pixelMovement = brushMode === 'bore'
    ? Math.hypot( event.movementX, event.movementY )
    : Math.abs( event.movementY );
  const distanceToCamera = camera.position.distanceTo( intersection.point );
  const worldUnitsPerPixel = 2 * distanceToCamera
    * Math.tan( THREE.MathUtils.degToRad( camera.fov / 2 ) )
    / renderer.domElement.clientHeight;
  const movement = pixelMovement * worldUnitsPerPixel * sculptStrength;
  const maxMovementPerEvent = brushRadius * 0.25;

  return Math.min( movement, maxMovementPerEvent )
    * ( brushMode === 'bore' ? -1 : 1 );
}

function applyStroke( mesh, samples, movement ) {
  if ( movement === 0 || !samples.length ) return;

  const position = mesh.geometry.getAttribute( 'position' );
  const radiusSquared = brushRadius * brushRadius;
  const vertex = new THREE.Vector3();

  for ( let i = 0; i < position.count; i++ ) {
    vertex.fromBufferAttribute( position, i );
    let closestDistanceSquared = radiusSquared;
    let closestNormal = null;

    for ( const sample of samples ) {
      const distanceSquared = vertex.distanceToSquared( sample.point );
      if ( distanceSquared < closestDistanceSquared ) {
        closestDistanceSquared = distanceSquared;
        closestNormal = sample.normal;
      }
    }

    if ( !closestNormal ) continue;

    const falloff = 1 - Math.sqrt( closestDistanceSquared ) / brushRadius;
    const smoothFalloff = falloff * falloff * ( 3 - 2 * falloff );
    const influence = smoothFalloff * movement;
    vertex.addScaledVector( closestNormal, influence );
    position.setXYZ( i, vertex.x, vertex.y, vertex.z );
  }

  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

function updateBrushIndicator( intersection ) {
  if ( !intersection?.face ) {
    brushIndicator.visible = false;
    return;
  }

  const mesh = intersection.object;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix( mesh.matrixWorld );
  const normal = intersection.face.normal.clone().applyMatrix3( normalMatrix ).normalize();
  brushIndicator.position.copy( intersection.point ).addScaledVector( normal, 0.01 );
  brushIndicator.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), normal );
  brushIndicator.visible = true;
}

function setBrushMode( mode ) {
  brushMode = mode;
  sculptBrushButton.setAttribute( 'aria-pressed', String( mode === 'sculpt' ) );
  boreBrushButton.setAttribute( 'aria-pressed', String( mode === 'bore' ) );
}

sculptBrushButton.addEventListener( 'click', () => setBrushMode( 'sculpt' ) );
boreBrushButton.addEventListener( 'click', () => setBrushMode( 'bore' ) );

renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.cursor = 'grab';

renderer.domElement.addEventListener( 'pointerdown', event => {
  if ( event.button !== 0 ) return;

  lastStrokePoint = null;
  const intersection = getIntersection( event );
  updateBrushIndicator( intersection );
  if ( !intersection ) return;

  sculpting = true;
  lastStrokePoint = getStrokePoint( intersection, event.clientX, event.clientY );
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
  renderer.domElement.setPointerCapture( event.pointerId );
} );

renderer.domElement.addEventListener( 'pointermove', event => {
  const intersection = getIntersection( event );
  updateBrushIndicator( intersection );
  if ( !sculpting ) return;
  if ( !intersection?.face ) {
    lastStrokePoint = null;
    return;
  }

  const currentStrokePoint = getStrokePoint( intersection, event.clientX, event.clientY );
  const previousStrokePoint = lastStrokePoint;
  lastStrokePoint = currentStrokePoint;
  const movement = getStrokeMovement( event, intersection );

  const mesh = currentStrokePoint.mesh;
  if ( previousStrokePoint?.mesh !== mesh ) {
    applyStroke( mesh, [ currentStrokePoint ], movement );
    return;
  }

  const distance = previousStrokePoint.point.distanceTo( currentStrokePoint.point );
  const screenDistance = Math.hypot(
    event.clientX - previousStrokePoint.clientX,
    event.clientY - previousStrokePoint.clientY,
  );
  const spacing = Math.max( brushRadius * 0.5, 0.001 );
  const steps = Math.max(
    1,
    Math.ceil( distance / spacing ),
    Math.ceil( screenDistance / 4 ),
  );
  const samples = [];

  for ( let step = 0; step <= steps; step++ ) {
    const amount = step / steps;
    const sampleX = THREE.MathUtils.lerp( previousStrokePoint.clientX, event.clientX, amount );
    const sampleY = THREE.MathUtils.lerp( previousStrokePoint.clientY, event.clientY, amount );
    const sampleIntersection = getIntersectionAt( sampleX, sampleY, mesh );
    if ( sampleIntersection?.face ) {
      samples.push( getStrokePoint( sampleIntersection, sampleX, sampleY ) );
    }
  }

  applyStroke( mesh, samples, movement );
} );

function stopSculpting( event ) {
  if ( !sculpting ) return;

  sculpting = false;
  lastStrokePoint = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'grab';
  if ( renderer.domElement.hasPointerCapture( event.pointerId ) ) {
    renderer.domElement.releasePointerCapture( event.pointerId );
  }
}

renderer.domElement.addEventListener( 'pointerup', stopSculpting );
renderer.domElement.addEventListener( 'pointercancel', stopSculpting );
renderer.domElement.addEventListener( 'pointerleave', () => {
  if ( !sculpting ) brushIndicator.visible = false;
} );

function animate() {
  controls.update();
  renderer.clear();
  renderer.render( scene, camera );
  renderer.render( brushScene, camera );
}

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );