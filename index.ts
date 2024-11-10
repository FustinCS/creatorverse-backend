// backend/index.ts
import express from "express";
import http from "http";
import cors from "cors";
import { Server, Socket } from "socket.io";

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: "*",
    methods: ["GET", "POST"],
};

app.use(cors(corsOptions));

const io = new Server(server, {
    cors: corsOptions,
});

const PORT = parseInt(process.env.PORT || "3000");

// In-memory data structures to store communities and rooms
interface Room {
    id: string;
    communityId: string;
    participants: string[]; // List of socket IDs
}

const communities: { [communityId: string]: string[] } = {}; // communityId -> roomIds
const rooms: { [roomId: string]: Room } = {}; // roomId -> Room object

app.use(express.json());

// Endpoint to get list of rooms for a community
app.get("/communities/:communityId/rooms", (req, res) => {
    const communityId = req.params.communityId;
    const roomIds = communities[communityId] || [];
    const roomList = roomIds.map((roomId) => {
        const room = rooms[roomId];
        return {
            id: roomId,
            participants: room.participants.length,
        };
    });
    res.json(roomList);
});

// Endpoint to create a new room in a community
app.post("/communities/:communityId/rooms", (req, res) => {
    const communityId = req.params.communityId;
    const roomId = generateUniqueId();
    const room: Room = {
        id: roomId,
        communityId,
        participants: [],
    };
    rooms[roomId] = room;
    if (!communities[communityId]) {
        communities[communityId] = [];
    }
    communities[communityId].push(roomId);
    res.json({ roomId });
});

app.get("/", (req, res) => {
    res.send("Server is running.");
});

// Socket.IO connection
io.on("connection", (socket: Socket) => {
    console.log(`New client connected: ${socket.id}`);
    // sending socket id through the 'me' event to the front end
    socket.emit('me', socket.id);


      // calluser event
    socket.on("calluser", ({ userToCall, signalData, from, name }) => {
        io.to(userToCall).emit("calluser", { signal: signalData, from, name });
    });


    // Join a room
    socket.on("joinRoom", (roomId: string) => {
        if (!rooms[roomId]) {
            socket.emit("error", "Room does not exist");
            return;
        }

        // Limit participants to 2 for one-on-one conversations
        if (rooms[roomId].participants.length >= 2) {
            socket.emit("error", "Room is full");
            return;
        }

        socket.join(roomId);
        rooms[roomId].participants.push(socket.id);
        console.log(`Socket ${socket.id} joined room ${roomId}`);

        // Notify other participant
        socket.to(roomId).emit("userJoined", { userId: socket.id });

        // Optionally, send room details or participant list
    });

    // Leave a room
    socket.on("leaveRoom", (roomId: string) => {
        if (rooms[roomId]) {
            socket.leave(roomId);
            rooms[roomId].participants = rooms[roomId].participants.filter(
                (id) => id !== socket.id
            );
            console.log(`Socket ${socket.id} left room ${roomId}`);

            // Notify other participant
            socket.to(roomId).emit("userLeft", { userId: socket.id });

            // If room is empty, you may choose to delete it
            if (rooms[roomId].participants.length === 0) {
                delete rooms[roomId];
                const communityId = rooms[roomId]?.communityId;
                if (communityId) {
                    communities[communityId] = communities[communityId].filter(
                        (id) => id !== roomId
                    );
                }
                console.log(`Room ${roomId} deleted`);
            }
        }
    });

    // Handle call initiation
    socket.on(
        "callUser",
        (data: {
            roomId: string;
            signalData: any;
            from: string;
            name: string;
        }) => {
            console.log(`callUser event in room ${data.roomId}`);
            socket.to(data.roomId).emit("callUser", {
                signal: data.signalData,
                from: data.from,
                name: data.name,
            });
        }
    );

    // Handle answering a call
    socket.on(
        "answerCall",
        (data: { roomId: string; signalData: any; to: string }) => {
            console.log(`answerCall event in room ${data.roomId}`);
            socket.to(data.roomId).emit("callAccepted", {
                signal: data.signalData,
                to: data.to,
            });
        }
    );

    // Handle ICE candidates
    socket.on("iceCandidate", (data: { roomId: string; candidate: any }) => {
        socket.to(data.roomId).emit("iceCandidate", data);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);

        // Remove socket from any rooms it's in
        for (const roomId in rooms) {
            if (rooms[roomId].participants.includes(socket.id)) {
                rooms[roomId].participants = rooms[roomId].participants.filter(
                    (id) => id !== socket.id
                );
                socket.to(roomId).emit("userLeft", { userId: socket.id });

                // If room is empty, delete it
                if (rooms[roomId].participants.length === 0) {
                    const communityId = rooms[roomId].communityId;
                    delete rooms[roomId];
                    if (communityId) {
                        communities[communityId] = communities[
                            communityId
                        ].filter((id) => id !== roomId);
                    }
                    console.log(`Room ${roomId} deleted`);
                }
            }
        }
    });
});
server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));

// Utility function to generate unique IDs
function generateUniqueId(): string {
    return Math.random().toString(36).substr(2, 9);
}

// // import 'dotenv/config';
// import express from "express";
// import http from "http";
// import cors from "cors";
// import { Server } from "socket.io";

// const app = express();
// const server = http.createServer(app);

// const io = new Server(server, {
//     cors: {
//         origin: "*",
//         methods: ["GET", "POST"],
//     },
// });

// app.use(cors());

// const PORT = process.env.PORT || 3000;

// app.get("/", (req, res) => {
//     res.send("Server is running.");
// });

// // this will be run every time someone connects to our website
// io.on("connection", (socket) => {
//     // set events to listen to from that socket that we conected from

//     // we are sending the socket id through the 'me' event to the front end
//     socket.emit("me", socket.id);

//     // In the front end we will have 3 refs for these 3 events
//     // connectionRef, myVideo and userVideo

//     // disconnect event
//     socket.on("disconnect", () => {
//         socket.broadcast.emit("callended");
//     });

//     // calluser event
//     socket.on("calluser", ({ userToCall, signalData, from, name }) => {
//         io.to(userToCall).emit("calluser", { signal: signalData, from, name });
//     });

//     // answercall event
//     socket.on("answercall", (data) => {
//         io.to(data.to).emit("callaccepted", data.signal);
//     });
// });

// server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
