<?php
include_once 'db.php';

session_start();

function isLoggedIn() {
    return isset($_SESSION['user_id']);
}

$name = $_POST['name'] ?? '';
$password = $_POST['password'] ?? '';

if (!empty($name) && !empty($password)) {
$name = $_POST['name'];
$password = $_POST['password'];

$stmt = $dbconnect->prepare("INSERT INTO users (name, password) VALUES (?, ?)");
$stmt->bind_param("ss", $name, $password);
$stmt->execute();

if ($stmt->execute()) {
echo "Account created successfully.";
} else {
die("An error occured.");
}
$stmt->close();
}
// function login($username, $password) {
//     global $conn;
//     $stmt = $conn->prepare("SELECT id, password FROM users WHERE name = ?");
//     $stmt->bind_param("s", $username);
//     $stmt->execute();
//     $stmt->store_result();
//     if ($stmt->num_rows > 0) {
//         $stmt->bind_result($id, $hashed_password);
//         $stmt->fetch();
//         if (password_verify($password, $hashed_password)) {
//             $_SESSION['user_id'] = $id;
//             return true;
//         }
//     }
//     return false;
// }

function logout() {
    session_destroy();
}
?>