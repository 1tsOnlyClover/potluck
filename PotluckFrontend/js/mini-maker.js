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
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const geometry = new THREE.DodecahedronGeometry( 1, 0 );
const material = new THREE.MeshBasicMaterial( { color: 0xdcdcdc } );
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

camera.position.z = 5;
controls.update();

const titleButton = document.querySelector( '#mini-title' );
const renameForm = document.querySelector( '#rename-form' );
const nameInput = document.querySelector( '#mini-name' );
const saveButton = document.querySelector( '#save-mini' );
const loadButton = document.querySelector( '#load-mini' );
const status = document.querySelector( '#mini-status' );
const loadDialog = document.querySelector( '#load-mini-dialog' );
const loadForm = document.querySelector( '#load-mini-form' );
const savedMiniSelect = document.querySelector( '#saved-mini-select' );
const storageKey = `potluck.minis.${encodeURIComponent( document.body.dataset.userName )}`;
let miniName = titleButton.textContent.trim();
let miniId = null;

function readSavedMinis() {
  const stored = localStorage.getItem( storageKey );
  if ( !stored ) return [];

  const minis = JSON.parse( stored );
  if ( !Array.isArray( minis ) || minis.some( mini => !mini.id || !mini.name || !mini.scene ) ) {
    throw new Error( 'Saved minis data has an invalid format.' );
  }
  return minis;
}

function setStatus( message ) {
  status.textContent = message;
}

titleButton.addEventListener( 'click', () => {
  nameInput.value = miniName;
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
    setStatus( 'Enter a name for this mini.' );
    nameInput.focus();
    return;
  }

  miniName = nextName;
  titleButton.textContent = miniName;
  titleButton.hidden = false;
  renameForm.hidden = true;
  setStatus( 'Mini renamed. Save to keep the new name.' );
} );

saveButton.addEventListener( 'click', () => {
  try {
    const minis = readSavedMinis();
    miniId ||= globalThis.crypto.randomUUID();

    const savedMini = {
      id: miniId,
      name: miniName,
      scene: scene.toJSON(),
      updatedAt: new Date().toISOString(),
    };
    const existingIndex = minis.findIndex( mini => mini.id === miniId );
    if ( existingIndex === -1 ) minis.push( savedMini );
    else minis[ existingIndex ] = savedMini;

    localStorage.setItem( storageKey, JSON.stringify( minis ) );
    setStatus( `"${miniName}" saved in this browser.` );
  } catch ( error ) {
    console.error( 'Unable to save mini:', error );
    setStatus( 'Unable to save this mini in your browser storage.' );
  }
} );

loadButton.addEventListener( 'click', () => {
  try {
    const minis = readSavedMinis();
    if ( !minis.length ) {
      setStatus( 'No saved minis yet. Save a mini first.' );
      return;
    }

    savedMiniSelect.replaceChildren( ...minis.map( mini => {
      const option = document.createElement( 'option' );
      option.value = mini.id;
      option.textContent = mini.name;
      return option;
    } ) );
    loadDialog.showModal();
  } catch ( error ) {
    console.error( 'Unable to read saved minis:', error );
    setStatus( 'Unable to read saved minis from this browser.' );
  }
} );

document.querySelector( '#cancel-load' ).addEventListener( 'click', () => {
  loadDialog.close();
} );

loadForm.addEventListener( 'submit', event => {
  event.preventDefault();
  try {
    const selectedMini = readSavedMinis().find( mini => mini.id === savedMiniSelect.value );
    if ( !selectedMini ) {
      loadDialog.close();
      setStatus( 'That saved mini could not be found.' );
      return;
    }

    const loadedScene = new THREE.ObjectLoader().parse( selectedMini.scene );
    scene.clear();
    for ( const child of [ ...loadedScene.children ] ) scene.add( child );

    miniId = selectedMini.id;
    miniName = selectedMini.name;
    titleButton.textContent = miniName;
    loadDialog.close();
    setStatus( `"${miniName}" loaded.` );
  } catch ( error ) {
    console.error( 'Unable to load mini:', error );
    loadDialog.close();
    setStatus( 'Unable to load that mini. Its saved data may be damaged.' );
  }
} );

function animate() {
  controls.update();
  renderer.render( scene, camera );
}

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );