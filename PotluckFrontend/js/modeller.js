import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.domElement.setAttribute( 'aria-label', '3D mini preview' );
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.enableZoom = true;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.mouseButtons.LEFT = null;
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const geometry = new THREE.BoxGeometry( 1, 1, 1 );
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

THREE.MOUSE.addEventListener('mousedown', 'mousemove', (event) => {
    for (let i = 0; i < geometry.vertices.length; i++) {
        geometry.vertices[i].x += 0.01 * Math.sin(event.clientX * 0.01);
        geometry.vertices[i].y += 0.01 * Math.sin(event.clientY * 0.01);
    }
    geometry.verticesNeedUpdate = true;
});

function animate() {
  controls.update();
  renderer.render( scene, camera );
}

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );