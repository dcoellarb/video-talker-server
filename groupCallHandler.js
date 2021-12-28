const createPeerServerListeners = (peerServer) => {
    peerServer.on('connection', (client) => {
        console.log('succesfully connected to peer js server');
    });
}

module.exports = {
    createPeerServerListeners
};