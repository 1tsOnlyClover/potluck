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

const ambientLight = new THREE.HemisphereLight( 0xffffff, 0x4a4035, 1.4 );
const keyLight = new THREE.DirectionalLight( 0xffffff, 2 );
keyLight.position.set( -3, 5, 4 );
scene.add( ambientLight, keyLight );

const geometry = new THREE.DodecahedronGeometry( 1, 0 );
const material = new THREE.MeshStandardMaterial( { color: 0x315b3f, roughness: 0.8 } );
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
const galleryStatus = document.querySelector( '#gallery-status' );
const galleryItems = document.querySelector( '#gallery-items' );
const storageKey = `potluck.minis.${encodeURIComponent( document.body.dataset.userName )}`;
let miniName = titleButton.textContent.trim();
let miniId = null;
let savedAssets = [];
let thumbnailRenderer;
const thumbnailSize = 256;

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

function setGalleryStatus( message ) {
  galleryStatus.textContent = message;
}

async function loadGallery() {
  try {
    const response = await fetch( '/api/assets' );
    const assets = await readJsonResponse( response );
    if ( !response.ok ) throw new Error( assets.error || 'Unable to load your gallery.' );
    if ( !Array.isArray( assets ) ) throw new Error( 'Gallery data has an invalid format.' );

    savedAssets = assets;
    galleryItems.replaceChildren( ...assets.map( asset => {
      const item = document.createElement( 'button' );
      item.className = 'gallery-item';
      item.type = 'button';
      item.draggable = true;
      item.dataset.assetId = asset.id;
      item.setAttribute( 'aria-label', `Add ${asset.name} to the scene` );
      let thumbnail = asset.thumbnail;
      if ( !thumbnail ) {
        try {
          thumbnail = createAssetThumbnail( asset.scene );
        } catch ( error ) {
          console.error( `Unable to create a preview for "${asset.name}":`, error );
        }
      }

      if ( thumbnail ) {
        const preview = document.createElement( 'img' );
        preview.src = thumbnail;
        preview.alt = `${asset.name} preview`;
        preview.loading = 'lazy';
        item.append( preview );
      } else {
        const placeholder = document.createElement( 'span' );
        placeholder.className = 'gallery-item-preview';
        placeholder.textContent = 'Preview unavailable';
        item.append( placeholder );
      }
      const name = document.createElement( 'span' );
      name.className = 'gallery-item-name';
      name.textContent = asset.name;
      item.append( name );
      item.addEventListener( 'dragstart', event => {
        event.dataTransfer.setData( 'text/plain', asset.id );
        event.dataTransfer.effectAllowed = 'copy';
      } );
      item.addEventListener( 'click', () => addAssetToScene( asset ) );
      return item;
    } ) );
    setGalleryStatus( assets.length ? `${assets.length} saved asset${assets.length === 1 ? '' : 's'}` : 'No saved assets yet.' );
  } catch ( error ) {
    console.error( 'Unable to load asset gallery:', error );
    setGalleryStatus( error.message || 'Unable to load your gallery.' );
  }
}

async function readJsonResponse( response ) {
  const contentType = response.headers.get( 'content-type' ) || '';
  if ( !contentType.includes( 'application/json' ) ) {
    const body = await response.text();
    console.error( 'Asset API returned a non-JSON response:', response.status, body.slice( 0, 500 ) );
    throw new Error( 'The asset API returned a page instead of data. Restart the app and try again.' );
  }
  return response.json();
}

function createAssetThumbnail( sceneData ) {
  const assetScene = new THREE.ObjectLoader().parse( sceneData );
  const previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color( 0xf7f8f2 );
  const previewKeyLight = new THREE.DirectionalLight( 0xffffff, 2 );
  previewKeyLight.position.set( -3, 5, 4 );
  previewScene.add( new THREE.HemisphereLight( 0xffffff, 0x4a4035, 1.5 ), previewKeyLight );

  const previewModel = new THREE.Group();
  for ( const child of assetScene.children ) {
    if ( child.isLight || child.isCamera ) continue;
    previewModel.add( child.clone( true ) );
  }
  previewModel.updateMatrixWorld( true );

  const bounds = new THREE.Box3().setFromObject( previewModel );
  if ( bounds.isEmpty() ) throw new Error( 'The saved asset has no 3D model to preview.' );

  const center = bounds.getCenter( new THREE.Vector3() );
  const size = bounds.getSize( new THREE.Vector3() );
  const maxDimension = Math.max( size.x, size.y, size.z );
  if ( !Number.isFinite( maxDimension ) || maxDimension <= 0 ) {
    throw new Error( 'Unable to determine the saved asset size for its preview.' );
  }
  previewModel.position.sub( center );
  previewScene.add( previewModel );

  const fieldOfView = 35;
  const distance = ( maxDimension * 0.5 / Math.tan( THREE.MathUtils.degToRad( fieldOfView * 0.5 ) ) ) * 1.35;
  const previewCamera = new THREE.PerspectiveCamera(
    fieldOfView,
    1,
    Math.max( distance / 1000, 0.01 ),
    distance * 10,
  );
  previewCamera.position.set( distance * 0.7, distance * 0.55, distance );
  previewCamera.lookAt( 0, 0, 0 );

  if ( !thumbnailRenderer ) {
    thumbnailRenderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } );
    thumbnailRenderer.setSize( thumbnailSize, thumbnailSize );
    thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  thumbnailRenderer.render( previewScene, previewCamera );
  return thumbnailRenderer.domElement.toDataURL( 'image/jpeg', 0.82 );
}

function addAssetToScene( asset, clientX = window.innerWidth / 2, clientY = window.innerHeight / 2 ) {
  try {
    const loadedScene = new THREE.ObjectLoader().parse( asset.scene );
    const modelGroup = new THREE.Group();
    for ( const child of loadedScene.children ) {
      if ( child.isLight || child.isCamera ) continue;
      const model = child.clone( true );
      const lights = [];
      model.traverse( object => {
        if ( object.isLight || object.isCamera ) lights.push( object );
      } );
      for ( const light of lights ) light.parent?.remove( light );
      modelGroup.add( model );
    }

    let hasModel = false;
    modelGroup.traverse( object => {
      if ( object.isMesh ) hasModel = true;
    } );
    if ( !hasModel ) throw new Error( 'This asset does not contain a 3D model.' );

    modelGroup.updateMatrixWorld( true );
    const bounds = new THREE.Box3().setFromObject( modelGroup );
    const center = bounds.getCenter( new THREE.Vector3() );
    modelGroup.position.sub( center );

    const canvasBounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ( ( clientX - canvasBounds.left ) / canvasBounds.width ) * 2 - 1;
    pointer.y = -( ( clientY - canvasBounds.top ) / canvasBounds.height ) * 2 + 1;
    raycaster.setFromCamera( pointer, camera );
    const dropPlane = new THREE.Plane( new THREE.Vector3( 0, 0, 1 ), 0 );
    const dropPoint = raycaster.ray.intersectPlane( dropPlane, new THREE.Vector3() );
    if ( dropPoint ) modelGroup.position.add( dropPoint );

    scene.add( modelGroup );
    setStatus( `"${asset.name}" added to the scene.` );
  } catch ( error ) {
    console.error( 'Unable to add gallery asset:', error );
    setStatus( error.message || 'Unable to add that asset to the scene.' );
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener( 'dragover', event => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
} );
renderer.domElement.addEventListener( 'drop', event => {
  event.preventDefault();
  const asset = savedAssets.find( item => item.id === event.dataTransfer.getData( 'text/plain' ) );
  if ( !asset ) {
    setStatus( 'That gallery asset could not be found. Refresh the gallery and try again.' );
    return;
  }
  addAssetToScene( asset, event.clientX, event.clientY );
} );

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
    if ( !loadedScene.children.some( child => child.isLight ) ) {
      loadedScene.add( ambientLight, keyLight );
    }
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

loadGallery();

window.addEventListener( 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
} );