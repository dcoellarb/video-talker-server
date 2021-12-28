const express =  require('express');
const socket = require('socket.io');
const { ExpressPeerServer } = require('peer');
const groupCallHandler = require('./groupCallHandler');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const cors = require('cors');

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.get('/', (req, res) => {
    res.send({api: 'video-talker-api'});
});
app.get('/api/get-turn-credentials', (req, res) => {
    const accountSid = 'ACd510f69e6fbb6479653ccb66eed3c25e';
    const authToken = '99525d42fd0c593158d9b9199483d2bc';
    const client = twilio(accountSid, authToken);
    client.tokens.create().then((token) => res.send({ token }));
})

const server = app.listen(PORT, () => {
    console.log(`server is listening on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

const peerServer = ExpressPeerServer(server, {debug: true});
app.use('/peerjs', peerServer);
groupCallHandler.createPeerServerListeners(peerServer);

const io = socket(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

let peers = [];
let groupCallRooms = [];

const broadcastEventTypes = {
    ACTIVE_USERS: 'ACTIVE_USERS',
    GROUP_CALL_ROOMS: 'GROUP_CALL_ROOMS'
}

io.on('connection', (socket) => {
    socket.emit('connection', null);
    console.log('new user connected')
    console.log(socket.id)

    socket.on('register-new-user', (data) => {
        peers.push({
            username: data.username,
            socketId: data.socketId
        });
        console.log('registered new user');
        console.log(peers);

        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.ACTIVE_USERS,
            activeUsers: peers
        })

        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.GROUP_CALL_ROOMS,
            groupCallRooms
        })
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        peers = peers.filter(activeUser => activeUser.socketId !== socket.id);

        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.ACTIVE_USERS,
            activeUsers: peers
        });
        
        groupCallRooms = groupCallRooms.filter(room => room.socketId !== socket.id);
        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.GROUP_CALL_ROOMS,
            groupCallRooms
        })
    })

    // listeners related with direct call
    socket.on('pre-offer', (data) => {
        console.log('pre-offer handled');
        io.to(data.callee.socketId).emit('pre-offer', {
            callerUsername: data.caller.username,
            callerSocketId: socket.id
        });
    });

    socket.on('pre-offer-answer', (data) => {
        console.log('pre-offer-answer handled');
        io.to(data.callerSocketId).emit('pre-offer-answer', {
            answer: data.answer
        })
    })

    socket.on('webRTC-offer', (data) => {
        console.log('webRTC-offer handled');
        io.to(data.callerSocketId).emit('webRTC-offer', {
            offer: data.offer
        })
    })

    socket.on('webRTC-answer', (data) => {
        console.log('webRTC-answer handled');
        io.to(data.callerSocketId).emit('webRTC-answer', {
            answer: data.answer
        })
    })

    socket.on('webRTC-candidate', (data) => {
        console.log('webRTC-candidate handled');
        io.to(data.connectedUserSocketId).emit('webRTC-candidate', {
            candidate: data.candidate
        })
    })
    
    socket.on('user-hang-up', (data) => {
        console.log('user-hang-up handled');
        io.to(data.connectedUserSocketId).emit('user-hang-up')
    })

    //listeners related with group call
    socket.on('group-call-register', (data) => {
        console.log('group-call-register handled');
        const roomId = uuidv4();
        socket.join(roomId);
        const newGroupCallRoom = {
            peerId: data.peerId,
            hostName: data.username,
            socketId: socket.id,
            roomId: roomId
        }
        groupCallRooms.push(newGroupCallRoom);
        console.log(groupCallRooms);
        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.GROUP_CALL_ROOMS,
            groupCallRooms
        })
    });

    socket.on('group-call-join-request', (data) => {
        console.log('group-call-join-request');
        io.to(data.roomId).emit('group-call-join-request', {
            peerId: data.peerId,
            streamId: data.localStreamId
        })

        socket.join(data.roomId);
    })

    socket.on('group-call-user-leave', (data) => {
        console.log('group-call-user-leave handled');
        socket.leave(data.roomId);
        io.to(data.roomId).emit('group-call-user-leave', {
            streamId: data.streamId
        })
    })

    socket.on('group-call-closed-by-host', (data) => {
        console.log('group-call-closed-by-host handled');
        groupCallRooms = groupCallRooms.filter(room => room.peerId !== data.peerId);
        io.sockets.emit('broadcast', {
            event: broadcastEventTypes.GROUP_CALL_ROOMS,
            groupCallRooms
        })
    })
});