// Tidal Front local-only HTTP server. C++17, no third-party dependencies.
#include <arpa/inet.h>
#include <cerrno>
#include <csignal>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <netinet/in.h>
#include <set>
#include <signal.h>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

namespace fs = std::filesystem;
static volatile std::sig_atomic_t running = 1;
static int listener_fd = -1;
static void stop(int) { running = 0; if (listener_fd >= 0) ::close(listener_fd); }
static bool send_all(int fd, const char* bytes, std::size_t size) {
    while (size) {
        ssize_t n = ::send(fd, bytes, size, MSG_NOSIGNAL);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return false;
        bytes += n;
        size -= static_cast<std::size_t>(n);
    }
    return true;
}
static void reply(int fd, int code, const std::string& status, const std::string& body, const std::string& type, bool head = false) {
    std::ostringstream out;
    out << "HTTP/1.1 " << code << ' ' << status << "\r\nContent-Type: " << type
        << "\r\nContent-Length: " << body.size() << "\r\nX-Content-Type-Options: nosniff"
        << "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    const auto header = out.str();
    send_all(fd, header.data(), header.size());
    if (!head) send_all(fd, body.data(), body.size());
}
static bool allowed(const std::string& path) {
    // Preview images live in folders, but the HTTP service still only serves known files.
    static const std::set<std::string> buildingPreviews = [] {
      std::set<std::string> names = {
        "hq.png", "gunboat.png", "landing_craft.png", "gold.png", "wood.png", "steel.png", "store.png",
        "gold_store.png", "wood_store.png", "steel_store.png", "vault.png",
        "sniper.png", "mg.png", "mortar.png", "cannon.png", "rocket.png", "missile.png", "missile.jpeg", "drone.png"
      };
      const char* levelBuildingTypes[] = {"sniper","mg","mortar","cannon","rocket","missile","drone","hq","gold","wood","steel","gold_store","wood_store","steel_store","vault","store","gunboat","landing_craft"};
      for (const auto* type : levelBuildingTypes) for (int level = 1; level <= 10; ++level)
          names.insert(std::string(type) + "-lv" + std::to_string(level) + ".png");
      return names;
    }();
    static const std::set<std::string> unitPreviews = {
        "rifle.png", "heavy.png", "rocket.png", "tank.png", "medic.png"
    };
    static const std::set<std::string> weaponPreviews = {
        "fire.png", "barrage.png", "flare.png", "medkit.png", "shock.png"
    };
    const std::string buildingPrefix = "/assets/previews/buildings/";
    const std::string unitPrefix = "/assets/previews/units/";
    const std::string weaponPrefix = "/assets/previews/weapons/";
    if (path.rfind(buildingPrefix, 0) == 0) return buildingPreviews.count(path.substr(buildingPrefix.size())) != 0;
    if (path.rfind(unitPrefix, 0) == 0) return unitPreviews.count(path.substr(unitPrefix.size())) != 0;
    if (path.rfind(weaponPrefix, 0) == 0) return weaponPreviews.count(path.substr(weaponPrefix.size())) != 0;
    static const std::set<std::string> files = {
        "/", "/index.html", "/src/core.js", "/src/main.js", "/src/render.js", "/src/previews.js", "/src/i18n.js", "/src/style.css",
        "/assets/home_theme.ogg", "/assets/battle_theme.ogg", "/assets/scout_theme.ogg",
        "/assets/battle_morning_stealth.ogg", "/assets/battle_morning_combat.ogg",
        "/assets/battle_noon_stealth.ogg", "/assets/battle_noon_combat.ogg",
        "/assets/battle_afternoon_stealth.ogg", "/assets/battle_afternoon_combat.ogg",
        "/assets/battle_night_stealth.ogg", "/assets/battle_night_combat.ogg", "/assets/rifle.ogg",
        "/assets/sniper.ogg", "/assets/machinegun.ogg", "/assets/mortar.ogg",
        "/assets/cannon.ogg", "/assets/tank.ogg", "/assets/artillery.ogg", "/assets/explosion.ogg",
        "/assets/rocket.ogg", "/assets/shock.ogg", "/assets/flare.ogg",
        "/assets/medkit.ogg", "/assets/build.ogg", "/assets/win.ogg",
        "/assets/splash.ogg", "/assets/ramp.ogg", "/assets/steps.ogg", "/assets/ui_click.ogg",
        "/assets/select_hq.ogg", "/assets/select_gold.ogg", "/assets/select_wood.ogg",
        "/assets/select_steel.ogg", "/assets/select_storage.ogg", "/assets/select_gold_store.ogg",
        "/assets/select_wood_store.ogg", "/assets/select_steel_store.ogg", "/assets/select_vault.ogg",
        "/assets/select_defense.ogg", "/assets/select_mg.ogg", "/assets/select_mortar.ogg",
        "/assets/select_cannon.ogg", "/assets/select_rocket.ogg", "/assets/select_gunboat.ogg",
        "/assets/select_landing_craft.ogg",
        "/assets/landing_engine.ogg", "/assets/landing_impact.ogg",
        "/favicon.ico", "/manifest.webmanifest",
        "/assets/favicon-32.png", "/assets/favicon-192.png", "/assets/favicon-512.png",
        "/assets/app-icon-192.png", "/assets/app-icon-512.png", "/assets/app-icon-1024.png",
        "/assets/app-icon-square-512.png", "/assets/app-icon-square-1024.png", "/assets/app-icon-square-master.png"
    };
    return files.count(path) != 0;
}
static void handle(int fd, const fs::path& root) {
    char buf[8192];
    ssize_t count = recv(fd, buf, sizeof(buf) - 1, 0);
    if (count <= 0) return;
    buf[count] = '\0';
    std::istringstream req(std::string(buf, static_cast<std::size_t>(count)));
    std::string method, url, version;
    req >> method >> url >> version;
    const bool head = method == "HEAD";
    if (method != "GET" && !head) return reply(fd, 405, "Method Not Allowed", "Only GET/HEAD", "text/plain", head);
    if (url.size() > 200 || url.empty() || url[0] != '/') return reply(fd, 400, "Bad Request", "Invalid path", "text/plain", head);
    url = url.substr(0, url.find_first_of("?#"));
    if (!allowed(url)) return reply(fd, 404, "Not Found", "Not found", "text/plain", head);
    const fs::path path = root / (url == "/" ? "index.html" : url.substr(1));
    std::ifstream file(path, std::ios::binary);
    if (!file) return reply(fd, 404, "Not Found", "Not found", "text/plain", head);
    std::string data((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    std::string type = path.extension() == ".html" ? "text/html; charset=utf-8" :
                       path.extension() == ".css" ? "text/css; charset=utf-8" :
                       path.extension() == ".js" ? "text/javascript; charset=utf-8" :
                       path.extension() == ".png" ? "image/png" :
                       path.extension() == ".jpeg" || path.extension() == ".jpg" ? "image/jpeg" :
                       path.extension() == ".svg" ? "image/svg+xml; charset=utf-8" :
                       path.extension() == ".ico" ? "image/x-icon" :
                       path.extension() == ".webmanifest" ? "application/manifest+json; charset=utf-8" : "audio/ogg";
    reply(fd, 200, "OK", data, type, head);
}
int main(int argc, char** argv) {
    fs::path root = fs::canonical(argc > 1 ? argv[1] : ".");
    int port = 8787;
    if (argc > 2) {
        try { port = std::stoi(argv[2]); } catch (...) { std::cerr << "Invalid port\n"; return 1; }
    }
    if (port < 1024 || port > 65535) { std::cerr << "Port must be 1024-65535\n"; return 1; }
    struct sigaction action{};
    action.sa_handler = stop;
    sigemptyset(&action.sa_mask);
    action.sa_flags = 0;  // Interrupt accept() so Ctrl+C and the launcher can stop cleanly.
    sigaction(SIGINT, &action, nullptr);
    sigaction(SIGTERM, &action, nullptr);
    int listener = socket(AF_INET, SOCK_STREAM, 0);
    listener_fd = listener;
    if (listener < 0) { std::perror("socket"); return 1; }
    int reuse = 1; setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<std::uint16_t>(port));
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(listener, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0 || listen(listener, 16) < 0) {
        std::perror("bind/listen"); close(listener); return 1;
    }
    std::cout << "Tidal Front: http://127.0.0.1:" << port << "/ (Ctrl+C stops)\n" << std::flush;
    while (running) {
        int fd = accept(listener, nullptr, nullptr);
        if (fd < 0) { if (errno == EINTR && running) continue; if (running) std::perror("accept"); break; }
        timeval timeout{3, 0};
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        handle(fd, root);
        close(fd);
    }
    if (listener_fd >= 0) close(listener_fd);
    listener_fd = -1;
    return 0;
}
