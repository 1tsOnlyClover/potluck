import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
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

const geometry = new THREE.BoxGeometry( 1, 1, 1, 24, 24, 24 );
const material = new THREE.MeshBasicMaterial( { color: 0xdcdcdc } );
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

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
const storageKey = `potluck.assets.${encodeURIComponent( document.body.dataset.userName )}`;
let assetName = titleButton.textContent.trim();
let assetId = null;

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
const brushRadius = 0.55;
const sculptStrength = 0.01;
let sculpting = false;

function getIntersection( event ) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ( ( event.clientX - bounds.left ) / bounds.width ) * 2 - 1;
  pointer.y = -( ( event.clientY - bounds.top ) / bounds.height ) * 2 + 1;
  raycaster.setFromCamera( pointer, camera );

  return raycaster.intersectObjects( scene.children, true )
    .find( intersection => intersection.object.isMesh && intersection.object.geometry?.getAttribute( 'position' ) );
}

renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.cursor = 'grab';

renderer.domElement.addEventListener( 'pointerdown', event => {
  if ( event.button !== 0 ) return;

  const intersection = getIntersection( event );
  if ( !intersection ) return;

  sculpting = true;
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
  renderer.domElement.setPointerCapture( event.pointerId );
} );

renderer.domElement.addEventListener( 'pointermove', event => {
  if ( !sculpting ) return;

  const intersection = getIntersection( event );
  if ( !intersection || !intersection.face ) return;

  const mesh = intersection.object;
  const position = mesh.geometry.getAttribute( 'position' );
  const brushCenter = mesh.worldToLocal( intersection.point.clone() );
  const normal = intersection.face.normal.clone();
  const movement = -event.movementY * sculptStrength;

  if ( movement === 0 ) return;

  for ( let i = 0; i < position.count; i++ ) {
    const vertex = new THREE.Vector3().fromBufferAttribute( position, i );
    const distance = vertex.distanceTo( brushCenter );
    if ( distance >= brushRadius ) continue;

    const falloff = 1 - distance / brushRadius;
    const influence = falloff * falloff * movement;
    vertex.addScaledVector( normal, influence );
    position.setXYZ( i, vertex.x, vertex.y, vertex.z );
  }

  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
} );

function stopSculpting( event ) {
  if ( !sculpting ) return;

  sculpting = false;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'grab';
  if ( renderer.domElement.hasPointerCapture( event.pointerId ) ) {
    renderer.domElement.releasePointerCapture( event.pointerId );
  }
}

renderer.domElement.addEventListener( 'pointerup', stopSculpting );
renderer.domElement.addEventListener( 'pointercancel', stopSculpting );

function animate() {
  controls.update();
  renderer.render( scene, camera );
}

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );