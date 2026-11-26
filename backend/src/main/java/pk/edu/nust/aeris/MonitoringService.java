package pk.edu.nust.aeris;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class MonitoringService {
    static final String DEMO_SOURCE = "DEMO — synthetic sample data";
    final AreaRepository areas;
    final ReadingRepository readings;
    final PreferenceRepository preferences;
    final AlertRepository alerts;
    final boolean demo;
    final OpenMeteoService openMeteo;
    private final TransactionOperations transactions;

    @org.springframework.beans.factory.annotation.Autowired
    public MonitoringService(AreaRepository a, ReadingRepository r, PreferenceRepository p, AlertRepository s,
                             @Value("${aeris.demo}") boolean demo, OpenMeteoService openMeteo,
                             PlatformTransactionManager transactionManager) {
        this(a, r, p, s, demo, openMeteo, new TransactionTemplate(transactionManager));
    }

    MonitoringService(AreaRepository a, ReadingRepository r, PreferenceRepository p, AlertRepository s,
                      boolean demo, OpenMeteoService openMeteo, TransactionOperations transactions) {
        areas=a; readings=r; preferences=p; alerts=s; this.demo=demo;
        this.openMeteo=openMeteo;
        this.transactions=transactions;
    }
    @Scheduled(initialDelayString="${aeris.initial-delay:5000}", fixedDelay=900000)
    public void scheduledRefresh() { refresh(); }

    public synchronized void refresh() {
        for (var area: areas.findByArchivedFalseOrderByIdAsc()) {
            if (area.active) refreshArea(area);
        }
    }

    private void refreshArea(MonitoredArea area) {
        if (demo && latest(area.id).isEmpty()) seedDemo(area);
        area.lastError = demo ? null : openMeteo.refresh(area);
        areas.save(area);
        evaluateRecentReadings(area.id);
    }

    public record AddedArea(MonitoredArea area, boolean added) {}

    public synchronized AddedArea addPublicArea(String name, double latitude, double longitude) {
        var city = PakistanCities.find(name);
        var savedAreas = areas.findAll();
        for (var area : savedAreas) {
            if (!area.archived && matchesLocation(area, city, latitude, longitude)) {
                return new AddedArea(area, false);
            }
        }
        if (savedAreas.stream().anyMatch(area -> !area.archived && name.equalsIgnoreCase(area.name))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This name is already used for different coordinates. Add a district or region to distinguish it.");
        }
        if (savedAreas.stream().anyMatch(area -> area.archived
            && (area.customLocation || (PakistanCities.find(area.name) != null && area.name.contains(",")))
            && matchesLocation(area, city, latitude, longitude))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This location was archived by an administrator.");
        }
        var area = new MonitoredArea(name, latitude, longitude);
        area.customLocation = true;
        area = areas.save(area);
        refreshArea(area);
        return new AddedArea(area, true);
    }

    private boolean matchesLocation(MonitoredArea area, PakistanCities.City city, double latitude, double longitude) {
        return (city != null && PakistanCities.find(area.name) == city)
            || (Math.abs(area.latitude - latitude) < 0.00001 && Math.abs(area.longitude - longitude) < 0.00001);
    }
    public boolean isDemo() { return demo; }
    String source() { return demo ? DEMO_SOURCE : OpenMeteoService.SOURCE; }
    Optional<SmogReading> latest(Long areaId) { return readings.findFirstByAreaIdAndSourceOrderByTimestampDesc(areaId,source()); }
    static Double value(JsonNode h,String key,int i) {
        JsonNode n=h.path(key).path(i);
        return n.isNumber() && Double.isFinite(n.asDouble()) && n.asDouble()>=0 ? n.asDouble() : null;
    }
    void store(Long area, Instant time, Double aqi, Double pm25, Double pm10,String source) {
        if (readings.existsByAreaIdAndTimestampAndSource(area,time,source)) return;
        var r=new SmogReading(); r.areaId=area; r.timestamp=time; r.aqi=aqi; r.pm25=pm25; r.pm10=pm10; r.source=source;
        readings.save(r);
    }
    void seedDemo(MonitoredArea area) {
        Instant end=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.HOURS);
        for(int i=168;i>=0;i--) {
            Instant t=end.minusSeconds(i*3600L);
            double aqi=60+(area.id%5)*12+25*Math.sin(t.getEpochSecond()/18000.0);
            storeDemo(area.id,t,Math.rint(aqi));
        }
    }
    private void storeDemo(Long areaId, Instant time, double aqi) {
        store(areaId, time, aqi, Math.rint(aqi * .35), Math.rint(aqi * .6), DEMO_SOURCE);
    }
    public synchronized void demoReading(MonitoredArea area, int aqi) {
        transactions.executeWithoutResult(status -> {
            if (latest(area.id).isEmpty()) seedDemo(area);
            storeDemo(area.id, Instant.now().truncatedTo(ChronoUnit.MICROS), aqi);
            evaluateRecentReadings(area.id);
        });
    }
    boolean fresh(SmogReading r) { return r!=null && r.timestamp!=null && !r.timestamp.isAfter(Instant.now()) && !r.timestamp.isBefore(Instant.now().minusSeconds(10800)); }
    void evaluateRecentReadings(Long areaId) {
        Instant end=Instant.now();
        // Process eligible readings in time order so a delayed refresh cannot hide a crossing.
        readings.findByAreaIdAndSourceAndTimestampBetweenOrderByTimestampAsc(areaId,source(),end.minusSeconds(10800),end)
            .forEach(this::evaluate);
    }
    public synchronized void evaluate(SmogReading r) {
        if (!source().equals(r.source) || !fresh(r) || r.aqi==null) return;
        transactions.executeWithoutResult(status -> evaluateRules(r));
    }

    private void evaluateRules(SmogReading r) {
        for(var p:preferences.findByAreaIdAndEnabledTrue(r.areaId)) {
            if (p.lastEvaluatedAt != null && !r.source.equals(p.lastEvaluatedSource)) {
                closeEpisode(p.id);
                p.lastEvaluatedAt = null;
                p.aboveThreshold = false;
            }
            if(p.lastEvaluatedAt!=null && !r.timestamp.isAfter(p.lastEvaluatedAt)) continue;
            if(r.aqi<=p.aqiThreshold) {
                closeEpisode(p.id);
            } else if(!p.aboveThreshold) {
                var a=new SmogAlert(); a.areaId=r.areaId; a.preferenceId=p.id; a.readingId=r.id;
                a.message=(demo ? "Sample US AQI " : "US AQI ") + r.aqi + " exceeded your threshold of " + p.aqiThreshold;
                a.createdAt=Instant.now(); alerts.save(a);
            }
            p.aboveThreshold=r.aqi>p.aqiThreshold;
            p.lastEvaluatedAt=r.timestamp;
            p.lastEvaluatedSource=r.source;
            preferences.save(p);
        }
    }
    void closeEpisode(Long preferenceId) {
        for (var alert : alerts.findByPreferenceIdAndStatusIn(preferenceId, List.of("Active", "Acknowledged"))) {
            alert.status = "Resolved";
            alerts.save(alert);
        }
    }
    public synchronized void archiveArea(MonitoredArea area) {
        area.archived = true;
        area.active = false;
        saveArea(area);
    }

    public synchronized MonitoredArea saveArea(MonitoredArea area) {
        return transactions.execute(status -> {
            var saved = areas.save(area);
            if (!saved.active) {
                for (var preference : preferences.findByAreaIdAndEnabledTrue(saved.id)) {
                    closeEpisode(preference.id);
                    preference.aboveThreshold = false;
                    preference.lastEvaluatedAt = null;
                    preference.lastEvaluatedSource = null;
                    preferences.save(preference);
                }
            }
            return saved;
        });
    }
}
