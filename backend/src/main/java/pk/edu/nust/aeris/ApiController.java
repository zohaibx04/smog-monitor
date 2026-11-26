package pk.edu.nust.aeris;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class ApiController {
    final MonitoringService service;
    final String adminToken;
    final AreaRepository areas;
    final ReadingRepository readings;
    final PreferenceRepository preferences;
    final AlertRepository alerts;
    public ApiController(MonitoringService service, AreaRepository areas, ReadingRepository readings,
                         PreferenceRepository preferences, AlertRepository alerts,
                         @Value("${aeris.admin-token}") String token) {
        this.service=service;this.areas=areas;this.readings=readings;this.preferences=preferences;this.alerts=alerts;adminToken=token;
    }
    record AreaInput(@NotBlank @Size(max=80) String name,@Min(-90) @Max(90) double latitude,
                     @Min(-180) @Max(180) double longitude, boolean active) {}
    record PreferenceInput(@NotNull Long areaId,@Min(1) @Max(500) int aqiThreshold,boolean enabled) {}
    record DemoReadingInput(@NotNull @Min(0) @Max(500) Integer aqi) {}
    record PublicAreaInput(@NotBlank @Size(max=80) String name, @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
                           @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude) {}
    void authorize(String token) {
        if(adminToken.isBlank() || token==null || !MessageDigest.isEqual(adminToken.getBytes(StandardCharsets.UTF_8),token.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Set ADMIN_TOKEN on the server and enter the matching token.");
    }
    MonitoredArea area(Long id) { return areas.findById(id).filter(a -> !a.archived).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Area not found")); }
    @GetMapping("/status") public Map<String,Object> status() { return Map.of("mode",service.isDemo()?"demo":"live","source",service.source(),"time",Instant.now()); }
    @GetMapping("/areas") public List<Map<String,Object>> areas() {
        return areas.findByArchivedFalseOrderByIdAsc().stream().map(a -> {
            Map<String,Object> result=new LinkedHashMap<>(); result.put("area",a);
            var reading=service.latest(a.id).orElse(null);
            result.put("reading",reading); result.put("stale",!service.fresh(reading)); return result;
        }).toList();
    }
    @PostMapping("/areas")
    public MonitoringService.AddedArea addPublicArea(@Valid @RequestBody PublicAreaInput input) {
        if (!Double.isFinite(input.latitude()) || !Double.isFinite(input.longitude())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter valid latitude and longitude values.");
        }
        return service.addPublicArea(input.name().strip(), input.latitude(), input.longitude());
    }
    @PostMapping("/refresh") public Map<String,String> refresh() { service.refresh(); return Map.of("message","Refresh completed; inspect each area's data status."); }
    @PostMapping("/demo/areas/{id}/readings")
    public void demoReading(@PathVariable Long id, @Valid @RequestBody DemoReadingInput input) {
        if (!service.isDemo()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var area = area(id);
        if (!area.active) throw new ResponseStatusException(HttpStatus.CONFLICT, "Monitoring is paused for this location.");
        service.demoReading(area, input.aqi());
    }
    @GetMapping("/areas/{id}/history") public List<SmogReading> history(@PathVariable Long id,@RequestParam(defaultValue="24") int hours) {
        area(id); if(hours<1 || hours>2160) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Hours must be 1–2160");
        Instant end=Instant.now(); return readings.findByAreaIdAndSourceAndTimestampBetweenOrderByTimestampAsc(id,service.source(),end.minusSeconds(hours*3600L),end);
    }
    @GetMapping("/preferences") public List<AlertPreference> preferences() {
        var visible=areas.findByArchivedFalseOrderByIdAsc().stream().map(a -> a.id).toList();
        return preferences.findAll().stream().filter(p -> visible.contains(p.areaId)).toList();
    }
    @PostMapping("/preferences") public AlertPreference preference(@Valid @RequestBody PreferenceInput input) {
        return createPreference(input,false);
    }
    @PostMapping("/admin/preferences") public AlertPreference systemPreference(@RequestHeader(value="X-Admin-Token",required=false) String token,@Valid @RequestBody PreferenceInput input) {
        authorize(token);return createPreference(input,true);
    }
    private AlertPreference createPreference(PreferenceInput input,boolean systemRule) {
        area(input.areaId()); var p=new AlertPreference(); p.areaId=input.areaId(); p.aqiThreshold=input.aqiThreshold(); p.enabled=input.enabled();p.systemRule=systemRule;
        p=preferences.save(p);
        if(area(p.areaId).active) service.latest(p.areaId).ifPresent(service::evaluate); return p;
    }
    @PutMapping("/preferences/{id}") public AlertPreference editPreference(@PathVariable Long id,@Valid @RequestBody PreferenceInput input,@RequestHeader(value="X-Admin-Token",required=false) String token) {
        area(input.areaId());var p=preferences.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(p.systemRule) authorize(token);
        p.areaId=input.areaId();p.aqiThreshold=input.aqiThreshold();p.enabled=input.enabled();p.lastEvaluatedAt=null;p.lastEvaluatedSource=null;p.aboveThreshold=false;
        // Close the previous rule episode when its criteria change.
        service.closeEpisode(p.id);
        p=preferences.save(p);if(p.enabled && area(p.areaId).active) service.latest(p.areaId).ifPresent(service::evaluate);return p;
    }
    @DeleteMapping("/preferences/{id}") public void deletePreference(@PathVariable Long id,@RequestHeader(value="X-Admin-Token",required=false) String token) {
        var p=preferences.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(p.systemRule) authorize(token);
        service.closeEpisode(id);
        preferences.deleteById(id);
    }
    @GetMapping("/alerts") public List<SmogAlert> alerts() {
        var visible=areas.findByArchivedFalseOrderByIdAsc().stream().map(a -> a.id).toList();
        return alerts.findAllByOrderByCreatedAtDesc().stream().filter(a -> visible.contains(a.areaId)).toList();
    }
    @PatchMapping("/alerts/{id}") public SmogAlert acknowledge(@PathVariable Long id) {
        var a=alerts.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(a.status.equals("Active")) {a.status="Acknowledged";return alerts.save(a);} return a;
    }
    @PostMapping("/admin/areas") public MonitoredArea add(@RequestHeader(value="X-Admin-Token",required=false) String token,@Valid @RequestBody AreaInput input) {
        authorize(token);
        var visible = areas.findByArchivedFalseOrderByIdAsc();
        if(visible.stream().filter(a -> !a.customLocation).count()>=PakistanCities.ALL.size())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"All default cities are already configured.");
        var city = PakistanCities.find(input.name().trim());
        if (city == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose Karachi, Lahore, Islamabad, Peshawar or Quetta.");
        if (visible.stream().anyMatch(area -> PakistanCities.find(area.name) == city)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This city is already monitored.");
        }
        var area = areas.findAll().stream().filter(saved -> saved.archived && PakistanCities.find(saved.name) == city
            && saved.latitude == input.latitude() && saved.longitude == input.longitude()).findFirst()
            .orElseGet(() -> new MonitoredArea(city.name() + ", Pakistan", input.latitude(), input.longitude()));
        area.name = city.name() + ", Pakistan";
        area.archived = false;
        area.active = input.active();
        area.lastError = null;
        return areas.save(area);
    }
    @PutMapping("/admin/areas/{id}") public MonitoredArea edit(@RequestHeader(value="X-Admin-Token",required=false) String token,@PathVariable Long id,@Valid @RequestBody AreaInput input) {
        authorize(token);var a=area(id);
        if(!a.customLocation && PakistanCities.find(input.name().trim())!=PakistanCities.find(a.name))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Keep the configured city identity.");
        if((a.latitude!=input.latitude() || a.longitude!=input.longitude()) && readings.existsByAreaId(id))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"This location already has readings. Add a new location for different coordinates to preserve historical accuracy.");
        a.name=a.customLocation ? input.name().strip() : PakistanCities.find(a.name).name() + ", Pakistan";
        a.latitude=input.latitude();a.longitude=input.longitude();a.active=input.active();a.lastError=null;
        return service.saveArea(a);
    }
    @DeleteMapping("/admin/areas/{id}") public void delete(@RequestHeader(value="X-Admin-Token",required=false) String token,@PathVariable Long id) {
        authorize(token);service.archiveArea(area(id));
    }
}


