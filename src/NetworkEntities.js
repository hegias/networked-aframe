/* global NAF */
var ChildEntityCache = require('./ChildEntityCache');

class NetworkEntities {

  constructor() {
    this.entities = {};
    this.childCache = new ChildEntityCache();
    this.onRemoteEntityCreatedEvent = new Event('remoteEntityCreated');
    this._persistentFirstSyncs = {};
  }

  registerEntity(networkId, entity) {
    this.entities[networkId] = entity;
  }

  createRemoteEntity(entityData) {
    NAF.log.write('Creating remote entity', entityData);

    var networkId = entityData.networkId;
    var el = NAF.schemas.getCachedTemplate(entityData.template);

    el.setAttribute('id', 'naf-' + networkId);

    this.initPosition(el, entityData.components);
    this.initRotation(el, entityData.components);
    this.addNetworkComponent(el, entityData);

    this.registerEntity(networkId, el);

    return el;
  }

  initPosition(entity, componentData) {
    var hasPosition = componentData['position'];
    if (hasPosition) {
      var position = componentData.position;
      entity.setAttribute('position', position);
    }
  }

  initRotation(entity, componentData) {
    var hasRotation = componentData['rotation'];
    if (hasRotation) {
      var rotation = componentData.rotation;
      entity.setAttribute('rotation', rotation);
    }
  }

  addNetworkComponent(entity, entityData) {
    var networkData = {
      template: entityData.template,
      creator: entityData.creator,
      owner: entityData.owner,
      networkId: entityData.networkId,
      persistent: entityData.persistent
    };

    entity.setAttribute('networked', networkData);
    entity.firstUpdateData = entityData;
  }

  updateEntityMulti(client, dataType, entityDatas, source) {
    if (NAF.options.syncSource && source !== NAF.options.syncSource) return;
    for (let i = 0, l = entityDatas.d.length; i < l; i++) {
      this.updateEntity(client, 'u', entityDatas.d[i], source);
    }
  }

  updateEntity(client, dataType, entityData, source) {
    if (NAF.options.syncSource && source !== NAF.options.syncSource) return;
    var networkId = entityData.networkId;

    if (this.hasEntity(networkId)) {
      this.entities[networkId].components.networked.networkUpdate(entityData);
    } else if (entityData.isFirstSync) {
      if (NAF.options.firstSyncSource && source !== NAF.options.firstSyncSource) {
        NAF.log.write('Ignoring first sync from disallowed source', source);
      } else {
        // TODO REMOVE THIS!!!!!!!!
        // HACK
    /*     if (entityData.persistent) {
          // If we receive a firstSync for a persistent entity that we don't have yet,
          // we assume the scene will create it at some point, so stash the update for later use.
          this._persistentFirstSyncs[networkId] = entityData;
        } else {
          this.receiveFirstUpdateFromEntity(entityData);
        } */
        this.receiveFirstUpdateFromEntity(entityData);
        // HACK END
      }
    }
  }

  receiveFirstUpdateFromEntity(entityData) {
    var parent = entityData.parent;
    var networkId = entityData.networkId;

    var parentNotCreatedYet = parent && !this.hasEntity(parent);
    if (parentNotCreatedYet) {
      console.log('1234 receiveFirstUpdateFromEntity -> PARENT NOT CREATED YET. parent is', parent, 'entityData is', entityData)
      this.childCache.addChild(parent, entityData);
    } else {
      var remoteEntity = this.createRemoteEntity(entityData);
      this.createAndAppendChildren(networkId, remoteEntity);
      this.addEntityToPage(remoteEntity, parent);
    }
  }

  createAndAppendChildren(parentId, parentEntity) {
    var children = this.childCache.getChildren(parentId);
    for (var i = 0; i < children.length; i++) {
      var childEntityData = children[i];
      var childId = childEntityData.networkId;
      if (this.hasEntity(childId)) {
        NAF.log.warn(
          'Tried to instantiate entity multiple times',
          childId,
          childEntityData,
          'Existing entity:',
          this.getEntity(childId)
        );
        continue;
      }
      var childEntity = this.createRemoteEntity(childEntityData);
      this.createAndAppendChildren(childId, childEntity);
      parentEntity.appendChild(childEntity);
    }
  }

  addEntityToPage(entity, parentId) {
    if (this.hasEntity(parentId)) {
      this.addEntityToParent(entity, parentId);
    } else {
      this.addEntityToSceneRoot(entity);
    }
  }

  addEntityToParent(entity, parentId) {
    var parentEl = document.getElementById('naf-' + parentId);
    parentEl.appendChild(entity);
  }

  addEntityToSceneRoot(el) {
    var scene = document.querySelector('a-scene');
    scene.appendChild(el);
  }

  completeSync(targetClientId, isFirstSync, force) {
    console.log('1234  - NetworkEntities  - completeSync ', 'target client id', targetClientId);
    // for (var id in this.entities) {
    //   if (this.entities[id]) {
    //     this.entities[id].components.networked.syncAll(targetClientId, isFirstSync, force);
    //   }
    // }
    // HACK
    Object.keys(this.entities).forEach((id, i)=>{
      if(this.entities[id]){
        this.entities[id].components.networked.syncAll(targetClientId, isFirstSync, force, i)
      }
    })
  }

  removeRemoteEntity(toClient, dataType, data, source) {
    if (NAF.options.syncSource && source !== NAF.options.syncSource) return;
    var id = data.networkId;
    console.log('1234  - NetworkEntities  - removeRemoteEntity', id);
    return this.removeEntity(id);
  }

  removeEntitiesOfClient(clientId) {
    console.log('1234  - NetworkEntities  - removeEntitiesOfClient  - clientId', clientId);
    var entityList = [];
    for (var id in this.entities) {
      var entityCreator = NAF.utils.getCreator(this.entities[id]);
      // HACK
			var entityOwner = this.entities[id].components.networked.data.owner;
			// END HACK
      if (entityCreator === clientId || (!entityCreator && entityOwner === clientId)) {
        const component = this.entities[id].getAttribute("networked")
        if (component && component.persistent) {
          // everyone will attempt to take ownership, someone will win, it does not particularly matter who
          var result = NAF.utils.takeOwnership(entity);
          if (result){
            this.entities[id].setAttribute('isBeingUsed', 'false');
          }
        } else {
          console.log('1234  - NetworkEntities  - removeEntitiesOfClient  - entityOwner ', entityOwner,'=== NAF.clientId', clientId);
          var entity = this.removeEntity(id);
          entityList.push(entity);
        }
      }
    }
    return entityList;
  }

  removeEntity(id) {
    this.forgetPersistentFirstSync(id);
    
    if (this.hasEntity(id)) {
      var entity = this.entities[id];
      this.forgetEntity(id);
      entity.parentNode.removeChild(entity);
      console.log('1234  - NetworkEntities  - removeEntity  - id', id);
      return entity;
    } else {
      NAF.log.error("Tried to remove entity I don't have.");
      return null;
    }
  }

  forgetEntity(id){
    delete this.entities[id];
    this.forgetPersistentFirstSync(id);
  }

  getPersistentFirstSync(id){
    return this._persistentFirstSyncs[id];
  }

  forgetPersistentFirstSync(id){
    delete this._persistentFirstSyncs[id];
  }

  getEntity(id) {
    if (this.entities[id]) {
      return this.entities[id];
    }
    return null;
  }

  hasEntity(id) {
    return !!this.entities[id];
  }

  removeRemoteEntities() {
    this.childCache = new ChildEntityCache();

    for (var id in this.entities) {
      var owner = this.entities[id].getAttribute('networked').owner;
      if (owner != NAF.clientId) {
        this.removeEntity(id);
      }
    }
  }
}

module.exports = NetworkEntities;
