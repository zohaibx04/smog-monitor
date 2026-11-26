package pk.edu.nust.aeris;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class NetworkInitializer implements ApplicationRunner {
    private final AreaRepository areas;
    private final PreferenceRepository preferences;
    private final AlertRepository alerts;
    public NetworkInitializer(AreaRepository a,PreferenceRepository p,AlertRepository s){areas=a;preferences=p;alerts=s;}
    @Override @Transactional public void run(ApplicationArguments args) {
        var visible=areas.findByArchivedFalseOrderByIdAsc();
        for(var area:visible) {
            if(area.customLocation || PakistanCities.find(area.name)!=null) continue;
            area.active=false;area.archived=true;areas.save(area);
            for(var preference:preferences.findByAreaIdAndEnabledTrue(area.id)){
                preference.enabled=false;
                preference.aboveThreshold=false;
                preferences.save(preference);
            }
        }
        var savedAreas = areas.findAll();
        for(var city:PakistanCities.ALL) {
            String networkName = city.name() + ", Pakistan";
            // Legacy archives used bare city names. Current removals retain the network name.
            if(savedAreas.stream().anyMatch(a -> !a.customLocation && PakistanCities.find(a.name)==city
                && (!a.archived || networkName.equalsIgnoreCase(a.name)))) continue;
            var area=areas.save(new MonitoredArea(networkName,city.latitude(),city.longitude()));
            var rule=new AlertPreference();rule.areaId=area.id;rule.aqiThreshold=150;rule.enabled=true;rule.systemRule=true;preferences.save(rule);
        }
        alerts.resolveIneligibleEpisodes();
    }
}
